// ============================================================================
// tools/derive-workers.mjs — BUILD 2026-08-25-workers.sql (the hired-worker
// server-settlement slice) by EXTRACTING the CURRENT live hr_apply / hr_state_of
// bodies and patching them at named anchors. Nothing is retyped.
//
//   node tools/derive-workers.mjs          # print the derived bodies
//   node tools/derive-workers.mjs --write  # (re)write the migration
//   node tools/derive-workers.mjs --check  # assert the migration matches
//
// WHY THIS EXISTS — read tools/derive-live-progress.mjs's header first. `create
// or replace` on the ~70 KB hr_apply / hr_state_of bodies you have not read
// silently deletes whichever invariant the typist did not know about. This
// script produces bodies that pass tests/run-sql-tests.mjs's HR_APPLY_CHAIN /
// HR_STATE_OF_CHAIN line by line, plus the worker slice's additions.
//
// SOURCES — THE CURRENT LAST TOUCHERS (they DIFFER, as of this slice):
//   hr_apply    <- 2026-08-21-streak-state.sql
//   hr_state_of <- 2026-08-24-inventory-complete.sql   (its own last toucher)
//
// ── WHAT IT SHIPS ───────────────────────────────────────────────────────────
//   hr_apply    — a `workers` sub-delta ({ uid: { xp:+n } }, per-worker xp
//                 credited into player_workers after re-validating uid ∈ the
//                 caller's OWN crew) + a `workers_accrued_to` watermark key
//                 (advanced from now()) + the `worker` ledger kind. Worker
//                 OUTPUT rides the existing signed `items` map, so the day budget
//                 already counts it. INSERTIONS ONLY except two terminator lines
//                 (c_delta_keys, c_ledger_kinds) — this chain's declared removals.
//   hr_state_of — projects `workers_accrued_to` + a `workers` crew array, and
//                 ANDs a THIRD ARM into `inventory_complete`: incomplete when the
//                 crew is non-empty AND now() - workers_accrued_to >= 60s. The
//                 crew read is in THIS transaction (a lagging read = false
//                 positive). One declared removal (the inventory_complete `case`
//                 gains an outer paren).
//
// ⚠ THIS FILE BECOMES THE LAST TOUCHER OF BOTH hr_apply AND hr_state_of.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');

const SRC_APPLY = '2026-08-21-streak-state.sql';        // last toucher of hr_apply
const SRC_STATE = '2026-08-24-inventory-complete.sql';  // last toucher of hr_state_of
const TARGET = '2026-08-25-workers.sql';

async function fnText(file, open) {
  const sql = (await readFile(join(MIG, file), 'utf8')).replace(/\r\n/g, '\n');
  const i = sql.indexOf(open);
  if (i < 0) throw new Error(`${file}: cannot find ${open}`);
  const j = sql.indexOf('\nend $$;\n', i);
  if (j < 0) throw new Error(`${file}: cannot find the end of ${open}`);
  return sql.slice(i, j + '\nend $$;'.length);
}
function patch(text, anchor, replacement, label) {
  const n = text.split(anchor).length - 1;
  if (n !== 1) throw new Error(`anchor "${label}" matched ${n} times, must match exactly 1`);
  return text.replace(anchor, replacement);
}

export async function deriveApply() {
  let t = await fnText(SRC_APPLY, 'create or replace function public.hr_apply(');

  // (1) c_delta_keys terminator gains the two worker keys. DECLARED REMOVAL.
  t = patch(t, `    'enchant'];`,
    `    'enchant',
    -- worker-settlement slice: the PARALLEL hired-crew accrual. \`workers\` is a
    -- per-worker xp sub-delta ({ uid: { xp:+n } }); \`workers_accrued_to\` is the
    -- crew's own watermark, advanced from now(). Worker OUTPUT rides \`items\`.
    'workers', 'workers_accrued_to'];`,
    'c_delta_keys gains workers + workers_accrued_to');

  // (2) c_ledger_kinds terminator gains 'worker'. DECLARED REMOVAL.
  t = patch(t, `    'quest','equip','admin','iap','clan','raid','enchant'];`,
    `    'quest','equip','admin','iap','clan','raid','enchant','worker'];`,
    'c_ledger_kinds gains worker');

  // (3) A blast-radius clamp on the number of worker xp ops per call. Inserted
  //     after c_max_fight_kills. INSERTION ONLY.
  t = patch(t, `  c_max_fight_kills constant bigint := 1000000;`,
    `  c_max_fight_kills constant bigint := 1000000;
  -- A crew is at most a handful of workers; this is a blast radius on the
  -- worker xp sub-delta, not a balance number.
  c_max_worker_ops constant int := 16;`,
    'c_max_worker_ops constant');

  // (4) The worker validation block, inserted before the daily budget. Each uid
  //     is re-validated against the CALLER'S OWN crew; xp is per-worker and is
  //     NEVER player xp / a skill row. INSERTION ONLY.
  t = patch(t,
    `    -- ── (4b) THE LEDGER-DERIVED DAILY BUDGET (C5 / X3) ───────────────────`,
    `    -- ── (4a-iv) HIRED-WORKER PRODUCTION (worker-settlement slice) ─────────
    -- A crew (player_workers) is server-owned — no client write policy — and
    -- gathers in PARALLEL to the active pointer on its OWN watermark. The engine
    -- proposes a \`workers\` sub-delta of PER-WORKER xp keyed by uid; each uid is
    -- re-validated HERE against the CALLER'S OWN crew, so a forged uid that names
    -- another player's worker (or one that does not exist) is refused, never
    -- silently credited. Worker xp is NEVER player xp and NEVER a player_skills
    -- row. The produced ITEMS ride the signed \`items\` map above, so the day
    -- budget already counted them; this block is xp only. The character row is
    -- already locked (for update above), so the membership read is a check, not a
    -- second lock.
    if p_delta ? 'workers' then
      if jsonb_typeof(p_delta->'workers') <> 'object' then
        perform public.hr_reject('bad_workers', jsonb_build_object('type', jsonb_typeof(p_delta->'workers')));
      end if;
      if (select count(*) from jsonb_object_keys(p_delta->'workers')) > c_max_worker_ops then
        perform public.hr_reject('too_many_worker_ops');
      end if;
      for k, v_eq in select key, value from jsonb_each(p_delta->'workers') loop
        if not exists (select 1 from public.player_workers
                        where user_id = v_uid and slot = v_slot and uid = k) then
          perform public.hr_reject('unknown_worker', jsonb_build_object('uid', k));
        end if;
        if jsonb_typeof(v_eq) <> 'object' or not (v_eq ? 'xp') then
          perform public.hr_reject('bad_workers', jsonb_build_object('uid', k));
        end if;
        v_n := coalesce((v_eq->>'xp')::bigint, 0);
        -- Monotonic and clamped, exactly like a player-skill xp op.
        if v_n < 0 or v_n > c_max_xp_delta then
          perform public.hr_reject('xp_clamp', jsonb_build_object('uid', k));
        end if;
        if v_n > 0 then
          update public.player_workers set xp = xp + v_n
           where user_id = v_uid and slot = v_slot and uid = k;
        end if;
      end loop;
    end if;

    -- ── (4b) THE LEDGER-DERIVED DAILY BUDGET (C5 / X3) ───────────────────`,
    'worker validation block before the daily budget');

  // (5) The SET clause advances workers_accrued_to from now() on presence. The
  //     engine only ever sends 'now'; the value is ignored and now() is used, so
  //     the crew watermark can never be set to the future. INSERTION ONLY.
  t = patch(t,
    `           accrued_to   = v_accrued,
           -- Slice 3: the daily settle streak, advanced above from now() on an`,
    `           accrued_to   = v_accrued,
           -- worker-settlement slice: the crew's own watermark. Advanced to
           -- now() whenever the delta carries it (the engine sends 'now'); the
           -- value is not trusted — now() is the server clock. Absent = untouched.
           workers_accrued_to = case when p_delta ? 'workers_accrued_to'
                                     then now() else workers_accrued_to end,
           -- Slice 3: the daily settle streak, advanced above from now() on an`,
    'workers_accrued_to in the SET clause');

  return t;
}

export async function deriveStateOf() {
  let t = await fnText(SRC_STATE, 'create or replace function public.hr_state_of(');

  // (1) Project the crew watermark in the state object. INSERTION.
  t = patch(t,
    `      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,`,
    `      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      -- worker-settlement slice: the hired crew's own accrual watermark. The
      -- accrual shell reads it as \`st.workers_accrued_to\` and settles
      -- [workers_accrued_to, now()] alongside the pointer. Flat, like the other
      -- watermarks, so a nested bag cannot hide a missing column behind a default.
      'workers_accrued_to', v_st.workers_accrued_to,`,
    'workers_accrued_to in the state object');

  // (2) Project the crew itself, top-level, next to enchant. INSERTION.
  t = patch(t,
    `    'enchant', coalesce(v_st.enchant, '{}'::jsonb),`,
    `    'enchant', coalesce(v_st.enchant, '{}'::jsonb),
    -- worker-settlement slice: the hired crew, server-owned (player_workers, no
    -- client write policy). The accrual shell reads this as \`env.workers\` and
    -- settles each assigned worker; the client renders it and computes no yield.
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object('uid', uid, 'name', name,
                                          'skill', skill, 'target_id', target_id, 'xp', xp)
                       order by uid)
        from public.player_workers where user_id = p_user and slot = v_st.slot), '[]'::jsonb),`,
    'workers crew array in the envelope');

  // (3) THE THIRD ARM of inventory_complete. The pointer `(case…end)` is already
  //     a parenthesised boolean expression; we simply AND the worker window onto
  //     it — no extra wrapping paren, so this is a pure INSERTION (no declared
  //     removal). The value becomes `(case…end) and (crew window drained)`.
  t = patch(t,
    `        else now() - greatest(v_st.accrued_to, v_st.active_since) < interval '60 seconds'
      end)
  );`,
    `        else now() - greatest(v_st.accrued_to, v_st.active_since) < interval '60 seconds'
      end)
      -- ── THIRD ARM (worker-settlement slice) ──────────────────────────────
      -- Also INCOMPLETE when the crew is non-empty AND its window is open
      -- (>= 60s since workers_accrued_to). The crew read is in THIS transaction —
      -- a lagging read would be a false-positive that lets the flip delete a
      -- pending worker haul. Pinned to ACCRUE_MIN_MS by the probe test.
      and (not exists (select 1 from public.player_workers pw
                        where pw.user_id = p_user and pw.slot = v_st.slot)
           or now() - v_st.workers_accrued_to < interval '60 seconds')
  );`,
    'inventory_complete third arm (worker window)');

  return t;
}

const SRC_RPC_GATE = '2026-08-23-bounty.sql';   // last toucher of hr_rpc_gate

export async function deriveRpcGate() {
  const sql = (await readFile(join(MIG, SRC_RPC_GATE), 'utf8')).replace(/\r\n/g, '\n');
  const open = 'create or replace function public.hr_rpc_gate(';
  const i = sql.indexOf(open);
  if (i < 0) throw new Error(`${SRC_RPC_GATE}: cannot find hr_rpc_gate`);
  const j = sql.indexOf('\nend $function$;', i);
  if (j < 0) throw new Error(`${SRC_RPC_GATE}: cannot find the end of hr_rpc_gate`);
  let t = sql.slice(i, j + '\nend $function$;'.length);
  // Append the two worker buckets to the 60/min arm, right after the farm ones.
  t = patch(t, `         'farm_plant', 'farm_harvest'\n      then v_limit := 60;`,
    `         'farm_plant', 'farm_harvest',
         -- worker-settlement slice: hire/assign are ordinary player writes.
         -- Added HERE, the CURRENT last toucher of hr_rpc_gate, because an
         -- unknown bucket fails closed — the RPCs would 429 forever otherwise.
         'worker_hire', 'worker_assign'
      then v_limit := 60;`,
    'worker buckets in hr_rpc_gate');
  return t;
}

function migration(apply, stateOf, rpcGate) {
  return `-- ============================================================================
-- 2026-08-25-workers.sql — the HIRED-WORKER SERVER-SETTLEMENT slice. This is the
-- last piece before the inventory absolute-replace flip can arm: it moves the
-- one remaining un-backed OWNABLE mint (workers.js accrueWorker -> client
-- addItem of a gather product) onto the server.
--
-- Governing rule: CLAUDE.md "Server authority (locked 2026-08-10)".
-- docs/design/worker-settlement.md, src/data/item-authority.js (the landmine).
--
-- ⚠ GENERATED. The restated hr_apply / hr_state_of below are produced by
--   \`node tools/derive-workers.mjs --write\` from the CURRENT last touchers
--   (hr_apply <- 2026-08-21-streak-state.sql, hr_state_of <-
--   2026-08-24-inventory-complete.sql) and patched at named anchors. Do NOT
--   hand-edit; \`--check\` runs in the suite and will fail.
--
-- ── WHAT SHIPS ───────────────────────────────────────────────────────────────
--   §1a  player_state.workers_accrued_to timestamptz not null default now()
--        — the crew's own accrual watermark, written ONLY by hr_apply from now().
--   §1b  player_workers(user_id, slot, uid, name, skill, target_id, xp) — the
--        server-owned crew. RLS own-read; NO client write policy. Written only by
--        the hire/assign RPCs and by hr_apply (worker xp). Copies player_farm §2.
--   §1c  player_ledger_kind_check gains 'worker' (the muster-'rally' pattern).
--   §1d  hr_state_of — projects workers_accrued_to + the crew, and ANDs the
--        completeness THIRD ARM (crew non-empty + open window => incomplete).
--   §1e  hr_apply — the \`workers\` xp sub-delta + \`workers_accrued_to\` key +
--        the \`worker\` ledger kind.
--   §2   hr_worker_assign — the ASSIGN intent (gating only, no value crosses).
--   §3   hr_worker_hire    — the HIRE intent (server gold debit + crew row).
--
-- ── WHY workers ARE A PARALLEL ACTIVITY, NOT AN ACCRUAL-SIM KIND ────────────
-- Combat/gather/artisan are the ACTIVE POINTER: one runs, priced tick-by-tick
-- over [accrued_to, now()]. A hired crew gathers WHILE the player fights or is
-- away, so it has its OWN watermark and is settled ALONGSIDE the pointer by
-- supabase/functions/hr-accrue/index.ts (accrueWorkers), EVEN WHEN the pointer
-- accrual refuses. NO RNG, so away == live by construction (one settle path).
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Additive. Reverting means re-applying the two predecessor bodies
-- (2026-08-21-streak-state.sql restores hr_apply, 2026-08-24-inventory-complete
-- .sql restores hr_state_of); player_workers + the column may be left in place
-- harmlessly (they simply stop being read/written). The client flip
-- (WORKER_PRODUCTION_SERVER_BACKED) must revert in the same breath.
--
-- ⚠ THIS FILE IS NOW THE LAST TOUCHER OF hr_apply AND hr_state_of.
-- ============================================================================

-- ── 0. PRECONDITIONS + LAST-TOUCHER SELF-CHECK — FAIL CLOSED ─────────────
do $$
declare v_apply text; v_state text;
begin
  select prosrc into v_apply from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if v_apply is null then raise exception 'hr_apply does not exist — apply the player-state chain first'; end if;
  if v_state is null then raise exception 'hr_state_of does not exist — apply the player-state chain first'; end if;

  -- hr_apply we are about to REPLACE must be the streak-state body.
  if position('streak_days    = case when p_delta ? ''accrued_to''' in v_apply) = 0 then
    raise exception 'the LIVE hr_apply is not the streak-state body — apply 2026-08-21-streak-state.sql first';
  end if;
  -- hr_state_of we are about to REPLACE must be the inventory-complete body.
  if position('''inventory_complete''' in v_state) = 0 then
    raise exception 'the LIVE hr_state_of is not the inventory-complete body — apply 2026-08-24-inventory-complete.sql first';
  end if;

  if position('p_delta ? ''workers''' in v_apply) > 0 then
    raise notice 'the worker block is already present — this apply is a no-op replace';
  end if;
  if to_regclass('public.player_state') is null
     or to_regclass('public.player_skills') is null
     or to_regclass('public.player_inventory') is null
     or to_regclass('public.player_ledger') is null
     or to_regclass('public.player_intents') is null then
    raise exception 'core player tables missing — run schema.sql + player-state migrations first';
  end if;
end $$;

-- ── 1a. THE CREW WATERMARK ────────────────────────────────────────────────
-- NOT NULL default now(): a fresh column backfills every existing row to now(),
-- so accrueWorkers settles nothing on the first pass (span 0) and initialises
-- cleanly. New characters inherit the default at creation. Written ONLY by
-- hr_apply from now() (§3 asserts no client write on player_state).
alter table public.player_state
  add column if not exists workers_accrued_to timestamptz not null default now();

-- ── 1b. THE SERVER-OWNED CREW (player_farm §2 pattern) ───────────────────
create table if not exists public.player_workers (
  user_id   uuid not null,
  slot      int  not null,
  uid       text not null,             -- the worker's stable id ('w…'), client-opaque
  name      text not null,
  skill     text,                      -- null = idle; else woodcutting|mining|fishing
  target_id text,                      -- the assigned gather node id, or null
  xp        bigint not null default 0,
  hired_at  timestamptz not null default now(),
  primary key (user_id, slot, uid)
);
create index if not exists player_workers_char_idx on public.player_workers (user_id, slot);

-- RLS: own-read only, and NO client write policy. The RPCs below (security
-- definer) + hr_apply are the only writers — that is what makes every gate real.
alter table public.player_workers enable row level security;
drop policy if exists "player_workers own read" on public.player_workers;
create policy "player_workers own read" on public.player_workers for select
  using ((select auth.uid()) = user_id);

-- ── 1c. THE LEDGER KIND (muster-'rally' pattern) ─────────────────────────
-- journal.kind:'worker' must be a legal player_ledger.kind, or hr_apply's ledger
-- insert violates player_ledger_kind_check and the WHOLE settle is bad_delta.
-- The table constraint mirrors hr_apply's c_ledger_kinds; both gain 'worker'.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'player_ledger_kind_check'
              and conrelid = 'public.player_ledger'::regclass) then
    alter table public.player_ledger drop constraint player_ledger_kind_check;
  end if;
  alter table public.player_ledger add constraint player_ledger_kind_check
    check (kind in ('accrue','craft','gather','combat','farm','trade','shop',
                    'quest','equip','admin','iap','clan','raid','enchant','worker'));
end $$;

-- ── 1d. hr_state_of — GENERATED. Do not hand-edit; see the header. ───────
${stateOf}
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 1e. hr_apply — GENERATED. Do not hand-edit; see the header. ──────────
${apply}

-- ── 1e-grants. GRANTS ON hr_apply — revoke from PUBLIC first, then grant ──
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 2. hr_worker_assign — the ASSIGN intent. NO value crosses. ───────────
-- The client sends {slot, uid, skill, target_id, idem}. Everything gated is
-- server-derived: the worker must be the caller's own, the node must exist and
-- match the skill, and the player must have reached the node's level themselves
-- (a worker cannot out-skill you — re-checked against SERVER xp). Passing
-- skill=null clears the assignment (idle). No qty, no rate, no id crosses.
create or replace function public.hr_worker_assign(
  p_slot int, p_uid text, p_skill text, p_target text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_state  public.player_state%rowtype;
  v_act    public.hr_activities%rowtype;
  v_lv     int;
  v_cached jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select result into v_cached from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_cached is not null then return v_cached; end if;
  if not public.hr_rpc_gate('worker_assign') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  if not exists (select 1 from public.player_workers
                  where user_id = v_uid and slot = p_slot and uid = p_uid) then
    return jsonb_build_object('ok', false, 'error', 'unknown_worker');
  end if;

  if p_skill is null or p_target is null then
    -- IDLE. Bank nothing here (the crew is settled by the accrual pass); just
    -- clear the pointer. A version bump so the next state read reflects it.
    update public.player_workers set skill = null, target_id = null
      where user_id = v_uid and slot = p_slot and uid = p_uid;
    update public.player_state set version = version + 1, updated_at = now()
      where user_id = v_uid and slot = p_slot;
    v_cached := jsonb_build_object('ok', true, 'uid', p_uid, 'skill', null, 'target_id', null);
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, p_slot, 'worker_assign', v_cached, now())
      on conflict (user_id, intent_id) do nothing;
    return v_cached;
  end if;

  if p_skill not in ('woodcutting','mining','fishing') then
    return jsonb_build_object('ok', false, 'error', 'bad_skill');
  end if;
  -- The node must exist as a GATHER activity of that skill. hr_activities is the
  -- generated catalogue; a worker can only ever be assigned a gather node.
  select * into v_act from public.hr_activities
    where kind = 'gather' and activity_id = p_target;
  if v_act.activity_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_node');
  end if;
  if v_act.req_skill is distinct from p_skill then
    return jsonb_build_object('ok', false, 'error', 'wrong_skill');
  end if;
  -- A worker cannot out-skill you: re-derive YOUR level from server xp.
  select public.hr_level_from_xp(coalesce((select xp from public.player_skills
     where user_id = v_uid and slot = p_slot and skill_id = p_skill), 0)) into v_lv;
  if v_act.req_lv is not null and v_lv < v_act.req_lv then
    return jsonb_build_object('ok', false, 'error', 'level_too_low', 'req_lv', v_act.req_lv);
  end if;

  update public.player_workers set skill = p_skill, target_id = p_target
    where user_id = v_uid and slot = p_slot and uid = p_uid;
  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  v_cached := jsonb_build_object('ok', true, 'uid', p_uid, 'skill', p_skill, 'target_id', p_target);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'worker_assign', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;
revoke execute on function public.hr_worker_assign(int, text, text, text, uuid) from public, anon;
grant execute on function public.hr_worker_assign(int, text, text, text, uuid) to authenticated;

-- ── 3. hr_worker_hire — the HIRE intent. The gold debit is SERVER-SIDE. ──
-- The client sends {slot, idem}. The next rung's cost + the crew cap are
-- server-derived from hr_worker_hire_costs (a generated catalogue, §3-pre) so no
-- price and no crew size crosses. The name is chosen server-side. This folds the
-- gold debit (was the separate hr_unlock_buy path) so a hostile client cannot
-- mint a free crew: the hire is gated by gold it must actually own.
create table if not exists public.hr_worker_hire_costs (
  rung int primary key,          -- crew size AFTER this hire (1..cap)
  cost bigint not null
);
-- The b389 hire ladder. NOTE: this is economy tuning (game data). It mirrors
-- src/features/workers.js HIRE_COSTS and MUST be kept in sync by a generator
-- follow-up (flagged for the security/designer review); seeded here so the RPC
-- is self-contained. Idempotent upsert.
insert into public.hr_worker_hire_costs (rung, cost) values
  (1, 500), (2, 3000), (3, 15000), (4, 75000), (5, 250000), (6, 750000)
  on conflict (rung) do update set cost = excluded.cost;

create or replace function public.hr_worker_hire(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_max_crew constant int := 6;
  v_uid    uuid := auth.uid();
  v_state  public.player_state%rowtype;
  v_n      int;
  v_cost   bigint;
  v_uidw   text;
  v_name   text;
  v_bud    jsonb;
  v_cached jsonb;
  c_names  constant text[] := array['Aldric','Berta','Cedric','Dagny','Edwin','Freya',
    'Gareth','Hilda','Ivor','Jorunn','Kellan','Liesl','Magnus','Nella','Osric','Petra'];
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select result into v_cached from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_cached is not null then return v_cached; end if;
  if not public.hr_rpc_gate('worker_hire') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  select count(*) into v_n from public.player_workers where user_id = v_uid and slot = p_slot;
  if v_n >= c_max_crew then
    return jsonb_build_object('ok', false, 'error', 'crew_full', 'cap', c_max_crew);
  end if;
  select cost into v_cost from public.hr_worker_hire_costs where rung = v_n + 1;
  if v_cost is null then
    return jsonb_build_object('ok', false, 'error', 'no_such_rung', 'rung', v_n + 1);
  end if;
  if v_state.gold < v_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold', 'have', v_state.gold, 'need', v_cost);
  end if;

  -- A server-chosen name not already in the crew; fall back to a numbered one.
  select n into v_name from unnest(c_names) as n
    where n not in (select name from public.player_workers where user_id = v_uid and slot = p_slot)
    order by array_position(c_names, n) limit 1;
  if v_name is null then v_name := 'Worker ' || (v_n + 1)::text; end if;
  v_uidw := 'w' || replace(gen_random_uuid()::text, '-', '');

  update public.player_state set gold = gold - v_cost, version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;
  insert into public.player_workers (user_id, slot, uid, name, skill, target_id, xp)
    values (v_uid, p_slot, v_uidw, v_name, null, null, 0);

  -- Journal the gold spend (kind='worker'). qty_in/xp_in null: no inflow.
  insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
    values (v_uid, p_slot, 'worker', 'worker_hire', -v_cost,
            jsonb_build_object('uid', v_uidw, 'name', v_name, 'rung', v_n + 1));

  v_cached := jsonb_build_object('ok', true, 'uid', v_uidw, 'name', v_name,
    'cost', v_cost, 'crew', v_n + 1);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'worker_hire', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;
revoke execute on function public.hr_worker_hire(int, uuid) from public, anon;
grant execute on function public.hr_worker_hire(int, uuid) to authenticated;

-- ── 3b. hr_rpc_gate — add the two worker buckets (60/min arm) ────────────
-- GENERATED from 2026-08-23-bounty.sql's body (its current last toucher) with
-- 'worker_hire' / 'worker_assign' appended to the 60-limit arm. Nothing else
-- changes. An unknown bucket fails CLOSED, so without this the hire/assign RPCs
-- would answer 429 having read and written nothing.
${rpcGate}
-- hr_rpc_gate is called only from inside other SECURITY DEFINER RPCs (running as
-- owner); no client role executes it directly. Revoke from PUBLIC, mirroring
-- 2026-08-11-authenticated-surface-lockdown.sql.
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 4. SELF-VERIFICATION — THE COMMIT GATE (STRUCTURAL) ──────────────────
do $$
declare v_apply text; v_state text; v_bad text; v_missing text; v_n int;
begin
  select prosrc into v_apply from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';

  -- (a) hr_apply CARRIES EVERYTHING THE STREAK BODY HAD, plus the worker block.
  foreach v_bad in array array[
    'c_release_codes', 'v_fight', 'tool_carry', 'hr_day_budget_check',
    'c_max_xp_delta', 'v_new_streak', 'streak_days    = case when p_delta ? ''accrued_to''',
    -- this file's change:
    'p_delta ? ''workers''', 'public.player_workers', 'unknown_worker',
    'c_max_worker_ops', 'workers_accrued_to = case when p_delta ? ''workers_accrued_to''',
    '''worker''];']
  loop
    if position(v_bad in v_apply) = 0 then
      raise exception 'the hr_apply that landed does not contain "%" — the restatement in §1e is wrong', v_bad;
    end if;
  end loop;

  -- (b) WORKER XP IS PER-WORKER, NEVER A player_skills WRITE FROM THE WORKERS
  --     BLOCK. The block writes player_workers.xp and nothing else.
  if position('update public.player_workers set xp = xp + v_n' in v_apply) = 0 then
    raise exception 'the worker block does not credit player_workers.xp — worker xp must be per-worker';
  end if;

  -- (c) hr_state_of PROJECTS the crew + watermark and carries the THIRD ARM.
  foreach v_bad in array array[
    '''workers_accrued_to'', v_st.workers_accrued_to', 'public.player_workers pw',
    '''inventory_complete''', 'now() - greatest(v_st.accrued_to, v_st.active_since)']
  loop
    if position(v_bad in v_state) = 0 then
      raise exception 'the hr_state_of that landed does not contain "%" — the restatement in §1d is wrong', v_bad;
    end if;
  end loop;

  -- (d) THE COLUMN + TABLE EXIST WITH THE RIGHT SHAPE.
  select count(*) into v_n from information_schema.columns
   where table_schema='public' and table_name='player_state'
     and column_name='workers_accrued_to' and data_type='timestamp with time zone' and is_nullable='NO';
  if v_n <> 1 then raise exception 'player_state.workers_accrued_to missing / not NOT NULL timestamptz'; end if;
  if to_regclass('public.player_workers') is null then raise exception 'player_workers table missing'; end if;

  -- (e) NO CLIENT WRITE POLICY on player_workers (read-only to its owner).
  select count(*) into v_n from pg_policy pol join pg_class c on c.oid = pol.polrelid
    where c.relname = 'player_workers' and pol.polcmd in ('a','w','d','*');
  if v_n > 0 then raise exception 'player_workers has % client write policy(ies) — must be RPC-only', v_n; end if;

  -- (f) NEITHER PRIVILEGED RPC IS CLIENT-EXECUTABLE; the hire/assign RPCs are.
  for v_missing in select unnest(array['anon','authenticated','service_role','public']) loop
    if has_function_privilege(v_missing, 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
      raise exception 'hr_apply is EXECUTABLE by % — that is the whole game', v_missing;
    end if;
    if has_function_privilege(v_missing, 'public.hr_state_of(uuid,integer)', 'execute') then
      raise exception 'hr_state_of is EXECUTABLE by %', v_missing;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
    raise exception 'hr_engine cannot execute hr_apply — every intent would 500';
  end if;
  if has_function_privilege('public', 'public.hr_worker_hire(int,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_worker_hire(int,uuid)', 'execute')
     or has_function_privilege('public', 'public.hr_worker_assign(int,text,text,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_worker_assign(int,text,text,text,uuid)', 'execute') then
    raise exception 'a worker RPC is executable by public/anon — revoke failed';
  end if;

  -- (g) THE LEDGER ADMITS 'worker'.
  if position('''worker''' in pg_get_constraintdef(
       (select oid from pg_constraint where conname = 'player_ledger_kind_check'
         and conrelid = 'public.player_ledger'::regclass))) = 0 then
    raise exception 'player_ledger_kind_check does not admit worker — journal.kind:worker would 23514';
  end if;

  -- (h) hr_rpc_gate ADMITS THE WORKER BUCKETS (else the RPCs 429 forever).
  if position('''worker_hire'', ''worker_assign''' in
       (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='hr_rpc_gate')) = 0 then
    raise exception 'hr_rpc_gate does not admit the worker buckets — hire/assign would rate_limit forever';
  end if;

  raise notice 'WORKERS OK (structural) — hr_apply worker block + watermark, hr_state_of crew/watermark/third-arm, player_workers RPC-only, ledger admits worker, RPCs gated. Behaviour driven by the §5 functional block + tests/worker-accrual.mjs.';
end $$;

-- ── 5. FUNCTIONAL SELF-CHECK — the settle path is PROVEN, not asserted ────
-- Drives a real crew through hr_apply's worker sub-delta end to end: uid ∈ crew
-- credits xp, a forged uid is refused, worker OUTPUT lands in player_inventory,
-- workers_accrued_to advances, and inventory_complete goes FALSE with an open
-- crew window and TRUE once settled. Rows are written in an HR819-discarded
-- subtransaction (player_ledger's immutability trigger refuses DELETE, so the
-- subtxn rollback is the only clean teardown — the farming §7 pattern).
do $$
declare
  v      jsonb; v_st jsonb;
  v_uid  constant uuid := '000000fb-0000-0000-0000-0000000000fb';
  v_slot constant int  := 0;
  v_ver  bigint;
  v_idem uuid;
  v_qty  bigint; v_wxp bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, workers_accrued_to)
      values (v_uid, v_slot, 1000000, 0, 1, now() - interval '12 hours')
      on conflict (user_id, slot) do update set gold = 1000000, version = 1,
        workers_accrued_to = now() - interval '12 hours';
    -- a maxed woodcutter so the assign level gate passes for normal_tree (req 1)
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, 'woodcutting', 13034431)
      on conflict (user_id, slot, skill_id) do update set xp = 13034431;
    insert into public.player_workers (user_id, slot, uid, name, skill, target_id, xp)
      values (v_uid, v_slot, 'wtest1', 'Aldric', 'woodcutting', 'normal_tree', 0)
      on conflict (user_id, slot, uid) do update set skill='woodcutting', target_id='normal_tree', xp=0;

    -- inventory_complete must be FALSE now (crew window open, 12h > 60s).
    v_st := public.hr_state_of(v_uid, v_slot);
    if (v_st->>'inventory_complete')::boolean is not false then
      raise exception 'GATE(a): inventory_complete should be FALSE with an open crew window, got %', v_st->'inventory_complete';
    end if;
    v_ver := (v_st->>'version')::bigint;

    -- Apply a worker settle delta: worker xp + one produced log + advance the
    -- watermark. (In production the engine builds this; here we assert hr_apply
    -- accepts and credits it.)
    v_idem := gen_random_uuid();
    v := public.hr_apply(v_uid, v_slot, v_ver, v_idem, jsonb_build_object(
      'items', jsonb_build_object('normal_log', 1440),
      'workers', jsonb_build_object('wtest1', jsonb_build_object('xp', 10800)),
      'workers_accrued_to', 'now',
      'journal', jsonb_build_object('kind', 'worker', 'intent', 'accrue')));
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(b): worker settle refused: %', v;
    end if;
    select qty into v_qty from public.player_inventory
      where user_id = v_uid and slot = v_slot and item_id = 'normal_log';
    if coalesce(v_qty,0) <> 1440 then raise exception 'GATE(b): worker output not credited (%)' , v_qty; end if;
    select xp into v_wxp from public.player_workers where user_id = v_uid and slot = v_slot and uid = 'wtest1';
    if v_wxp <> 10800 then raise exception 'GATE(b): worker xp not credited (%)' , v_wxp; end if;

    -- inventory_complete must be TRUE now (watermark = now(), window drained).
    v_st := public.hr_state_of(v_uid, v_slot);
    if (v_st->>'inventory_complete')::boolean is not true then
      raise exception 'GATE(c): inventory_complete should be TRUE after settle, got %', v_st->'inventory_complete';
    end if;

    -- A FORGED uid (not in the crew) is refused, crediting nothing.
    v_ver := (v_st->>'version')::bigint;
    v_idem := gen_random_uuid();
    v := public.hr_apply(v_uid, v_slot, v_ver, v_idem, jsonb_build_object(
      'workers', jsonb_build_object('not_my_worker', jsonb_build_object('xp', 999999)),
      'workers_accrued_to', 'now',
      'journal', jsonb_build_object('kind', 'worker', 'intent', 'accrue')));
    if v->>'ok' <> 'false' or v->>'error' <> 'unknown_worker' then
      raise exception 'GATE(d): a forged worker uid was NOT refused: %', v;
    end if;

    raise exception using errcode = 'HR819', message = 'workers §5 complete — rolling back';
  exception when sqlstate 'HR819' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_workers where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_skills where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §5 LEAKED a probe row';
  end if;
  raise notice 'workers §5 — settle credits output+worker-xp, forged uid refused, completeness false→true — all green';
end $$;

-- ── 6. CLIENT-RPC BASELINE — record the two hire/assign grants ────────────
do $$
declare v_n int := 0;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline absent — apply 2026-08-11-grant-hygiene.sql first';
  end if;
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
  select p.proname, pg_get_function_identity_arguments(p.oid), 'authenticated',
         'worker-settlement slice: hire/assign INTENTS. Server debits gold + writes '
         'the crew; NO qty/rate/price crosses. Deliberately NOT granted to hr_engine. 2026-08-25'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_worker_hire','hr_worker_assign')
     and not exists (select 1 from public.hr_client_rpc_baseline b
        where b.proname = p.proname
          and b.identity_args = pg_get_function_identity_arguments(p.oid)
          and b.grantee = 'authenticated');
  get diagnostics v_n = row_count;
  raise notice 'hr_client_rpc_baseline: % worker RPC row(s) recorded', v_n;
end $$;
`;
}

const SELF = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const apply = await deriveApply();
  const stateOf = await deriveStateOf();
  const rpcGate = await deriveRpcGate();
  if (process.argv.includes('--write')) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(MIG, TARGET), migration(apply, stateOf, rpcGate), 'utf8');
    console.log(`wrote supabase/migrations/${TARGET}`);
  } else if (process.argv.includes('--check')) {
    const mig = (await readFile(join(MIG, TARGET), 'utf8')).replace(/\r\n/g, '\n');
    if (!mig.includes(apply)) { console.error(`DRIFT: ${TARGET}'s hr_apply is not what this script derives from ${SRC_APPLY}.`); process.exit(1); }
    if (!mig.includes(stateOf)) { console.error(`DRIFT: ${TARGET}'s hr_state_of is not what this script derives from ${SRC_STATE}.`); process.exit(1); }
    if (!mig.includes(rpcGate)) { console.error(`DRIFT: ${TARGET}'s hr_rpc_gate is not what this script derives from ${SRC_RPC_GATE}.`); process.exit(1); }
    console.log(`derive-workers: ${TARGET} matches (hr_apply ${apply.length} B, hr_state_of ${stateOf.length} B, hr_rpc_gate ${rpcGate.length} B)`);
  } else {
    console.log(apply);
    console.log('\n\n-- ===== hr_state_of =====\n');
    console.log(stateOf);
  }
}
