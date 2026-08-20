// ============================================================================
// tools/derive-inventory-complete.mjs — BUILD 2026-08-24-inventory-complete.sql
// (the server-side `inventory_complete` signal, inventory-flip Step B1) by
// EXTRACTING the CURRENT live hr_state_of body and patching it at ONE named
// anchor. Nothing is retyped.
//
//   node tools/derive-inventory-complete.mjs          # print the derived body
//   node tools/derive-inventory-complete.mjs --write  # (re)write the migration
//   node tools/derive-inventory-complete.mjs --check  # assert the migration matches
//
// WHY THIS EXISTS — read tools/derive-live-progress.mjs's header first. `create
// or replace` on the hr_state_of body you have not read silently deletes
// whichever invariant the typist did not know about. This script produces a
// body that passes tests/run-sql-tests.mjs's HR_STATE_OF_CHAIN line by line,
// plus the ONE new thing.
//
// SOURCE — THE CURRENT LAST TOUCHER of hr_state_of:
//   hr_state_of <- 2026-08-21-streak-state.sql
//
// ── WHAT IT SHIPS ───────────────────────────────────────────────────────────
// A single ADDITIVE top-level envelope field, `inventory_complete` (boolean),
// computed from ALREADY-SERVER-STAMPED columns (active_kind / active_id /
// active_since / accrued_to). It is TRUE only when the accrual settle loop has
// no pending, un-drained window that could still grant OWNABLE items — i.e. the
// server's player_inventory is a complete statement of the owned set and the
// dormant absolute-replace flip (src/net/accrue.js) may safely fire.
//
// ── SINGLE SOURCE OF TRUTH (the load-bearing property) ──────────────────────
// This field does NOT re-derive completeness in a way that can disagree with the
// engine. It READS the engine's own completeness watermark — `accrued_to`, which
// is advanced to now() by, and ONLY by, a full settle (hr_apply on an accrual
// delta) — and compares it to now() against the engine's OWN minimum-span
// constant, ACCRUE_MIN_MS (60000 ms) in supabase/functions/hr-accrue/accrual.js.
// Below that span the engine settles NOTHING (SKIP.TOO_SOON), so no OWNABLE
// grant is pending and the baseline is complete; at or above it there is an
// un-settled payable window and the baseline may be missing grants → INCOMPLETE.
// The 60-second literal here is PINNED to ACCRUE_MIN_MS by
// tests/inventory-complete-probe.mjs (a drift guard), so the SQL and the engine
// cannot fall out of step.
//
// ── THE CHAINED-CRAFT HAZARD, HANDLED HONESTLY (see the report) ─────────────
// The flip's real blocker (accrue.js:863) is a freshly-crafted OWNED output
// whose input chain the server has not finished settling — invisible to
// hr_state_of, and DELETED by an absolute replace. Under the pure
// server-authoritative model this cannot arise while `inventory_complete` is
// true, for two structural reasons this field DEPENDS ON:
//   (1) EACH settle is ATOMIC. accrual.js emits ONE signed item delta (inputs
//       consumed + outputs produced) that hr_apply applies in ONE transaction,
//       so player_inventory never holds a half-settled craft.
//   (2) COLLECT-BEFORE-SWITCH. set-activity stamps accrued_to = now() on every
//       pointer change, fully draining the old activity's window into
//       player_inventory BEFORE the next begins — so no chain can span two
//       activity pointers mid-flight.
// Given (1)+(2), the ONLY window in which player_inventory can lag the owned set
// is the CURRENTLY-active pointer's un-drained tail — exactly what this field
// gates on. If either guarantee is ever weakened (genuine multi-pointer or
// partial settlement), this field MUST gain an engine-STAMPED completeness
// column; the report scopes that follow-up. FAIL-CLOSED throughout: an
// inconsistent payable row (no active_since) reads INCOMPLETE.
//
// ⚠ THIS FILE BECOMES THE LAST TOUCHER OF hr_state_of.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');

const SRC = '2026-08-21-streak-state.sql';       // last toucher of hr_state_of
const TARGET = '2026-08-24-inventory-complete.sql';

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

export async function deriveStateOf() {
  let t = await fnText(SRC, 'create or replace function public.hr_state_of(');

  // The ONE patch: the `total_level` terminator gains a comma and the new
  // `inventory_complete` field follows it. Everything else in the body is
  // carried verbatim, so the sole declared removal (run-sql-tests.mjs) is the
  // old comma-less terminator.
  t = patch(t,
    `    'total_level', public.hr_total_level(p_user, v_st.slot)
  );`,
    `    'total_level', public.hr_total_level(p_user, v_st.slot),
    -- ── inventory-flip Step B1: THE SERVER-STAMPED COMPLETENESS SIGNAL ───────
    -- TRUE only when the accrual settle loop has NO pending, un-drained window
    -- that could still grant OWNABLE items — i.e. player_inventory is a complete
    -- statement of the owned set and the dormant absolute-replace flip
    -- (src/net/accrue.js envelopeBaselineComplete) may safely fire. Read
    -- src/net/accrue.js:863 and tools/derive-inventory-complete.mjs's header for
    -- why a false negative merely defers the flip (safe) and a false positive
    -- would DELETE a legit crafted stack (the one irreversible mistake).
    --
    -- SINGLE SOURCE OF TRUTH: this reads the engine's OWN completeness watermark,
    -- accrued_to (advanced to now() by, and only by, a full settle), against the
    -- engine's OWN min-span ACCRUE_MIN_MS = 60000 ms (accrual.js). Below that
    -- span the engine settles nothing (SKIP.TOO_SOON) so no grant is pending;
    -- at/above it there is an un-settled payable window → INCOMPLETE. The 60s
    -- literal is pinned to ACCRUE_MIN_MS by tests/inventory-complete-probe.mjs.
    --
    -- FAIL-CLOSED and CHAINED-CRAFT-SAFE (see the tool header): idle/unknown
    -- pointer → no accrual → complete; a payable pointer with a drained window
    -- (< 60s) → complete, because each settle is atomic and collect-before-switch
    -- leaves no cross-pointer chain mid-flight; a payable pointer with an open
    -- window (>= 60s) OR an inconsistent payable row with no active_since →
    -- INCOMPLETE.
    'inventory_complete', (
      case
        when v_st.active_kind is null
          or v_st.active_kind not in ('combat', 'gather', 'artisan')
          or v_st.active_id is null
          then true
        when v_st.active_since is null
          then false
        else now() - greatest(v_st.accrued_to, v_st.active_since) < interval '60 seconds'
      end)
  );`,
    'inventory_complete after total_level');

  return t;
}

function migration(stateOf) {
  return `-- ============================================================================
-- 2026-08-24-inventory-complete.sql — the SERVER-STAMPED \`inventory_complete\`
-- signal (inventory-flip Step B1). hr_state_of gains ONE additive top-level
-- boolean; NOTHING ELSE in the database changes.
--
-- Governing rule: CLAUDE.md "Server authority (locked 2026-08-10)".
-- docs/design/live-settlement.md, src/net/accrue.js:863 (the dormant flip).
--
-- ⚠ GENERATED. The restated hr_state_of below is produced by
--   \`node tools/derive-inventory-complete.mjs --write\` from the CURRENT last
--   toucher (2026-08-21-streak-state.sql) and patched at ONE named anchor. Do
--   NOT hand-edit; \`--check\` runs in the suite and will fail. Retyping the body
--   is how a load-bearing invariant silently disappears.
--
-- ── WHAT SHIPS ───────────────────────────────────────────────────────────────
--   hr_state_of — a top-level \`inventory_complete\` boolean. TRUE only when the
--   accrual settle loop has no pending, un-drained window that could still grant
--   OWNABLE items, computed from ALREADY-SERVER-STAMPED columns (active_kind /
--   active_id / active_since / accrued_to). No new column, no new grant, no
--   change to hr_apply or the accrual engine's WRITES.
--
-- ── WHY NO hr_apply / NO NEW COLUMN ──────────────────────────────────────────
-- Completeness is a pure function of state the settle loop ALREADY stamps:
-- accrued_to IS the engine's completeness watermark (advanced to now() only by a
-- full settle), and the pointer columns say whether a window is open. Adding a
-- separate stamped column would be a SECOND completeness record that could
-- disagree with accrued_to — precisely the drift this design avoids. If a future
-- engine introduces genuine partial/multi-pointer settlement (so a settle can
-- advance accrued_to while leaving inventory inconsistent), THIS is where an
-- explicit engine-stamped column must be added; see the tool header.
--
-- ── APPLY ORDER ──────────────────────────────────────────────────────────────
--   ... -> 2026-08-21-streak-state.sql (predecessor of the hr_state_of body)
--       -> THIS FILE   (new last toucher of hr_state_of)
--   §0 fails closed if the live body is not the streak-state one.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Additive and non-destructive. Reverting means re-applying
-- 2026-08-21-streak-state.sql (restores the prior body); the field simply stops
-- being emitted, and the dormant client flip fails closed to MERGE — exactly its
-- behaviour today. No data is touched in either direction.
--
-- ⚠ THIS FILE IS NOW THE LAST TOUCHER OF hr_state_of.
-- ============================================================================

-- ── 0. PRECONDITIONS + LAST-TOUCHER SELF-CHECK — FAIL CLOSED ─────────────
do $$
declare v_state text;
begin
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if v_state is null then raise exception 'hr_state_of does not exist — apply the player-state chain first'; end if;

  -- The body we are about to REPLACE must be the streak-state one (its two
  -- distinctive markers: the streak projection AND the collection exclusion).
  if position('''streak_days'', v_st.streak_days' in v_state) = 0 then
    raise exception 'the LIVE hr_state_of is not the streak-state body (no streak projection) — apply 2026-08-21-streak-state.sql first';
  end if;
  if position('not like ''ev:loot:%''' in v_state) = 0 then
    raise exception 'the LIVE hr_state_of is not the streak-state body (no ev:loot exclusion) — apply 2026-08-21-streak-state.sql first';
  end if;

  if position('inventory_complete' in v_state) > 0 then
    raise notice 'inventory_complete is already present — this apply is a no-op replace';
  end if;
end $$;

-- ── 1. hr_state_of — GENERATED. Do not hand-edit; see the header. ────────
${stateOf}
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 2. SELF-VERIFICATION — THE COMMIT GATE (STRUCTURAL ONLY) ──────────────
-- ⚠ NO DRIVEN CHARACTER HERE, and that is deliberate — the same ruling
--   2026-08-21-streak-state.sql §3(g) states: this block runs on APPLY, which
--   COMMITS, so hr_create_character would leave a synthetic character (and
--   immutable player_ledger rows) in PRODUCTION. The field's BEHAVIOUR — TRUE
--   idle, FALSE open-window, TRUE drained, FALSE no-active_since — is driven
--   against the throwaway replay database by tests/inventory-complete-probe.mjs,
--   where teardown is free. Here we assert only the STRUCTURE of the body and
--   the grants, which cannot pollute anything.
do $$
declare v_state text; v_bad text; v_missing text; v_n int;
begin
  select prosrc into v_state from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';

  -- (a) EVERYTHING THE STREAK BODY HAD IS STILL HERE, plus the new field. A
  --     control set spanning every prior link of HR_STATE_OF_CHAIN.
  foreach v_bad in array array[
    'tool_carry', '''enchant'', coalesce(v_st.enchant', '''fight'', v_st.fight',
    '''streak_days'', v_st.streak_days', 'not like ''ev:kill_monster:%''',
    'not like ''ev:loot:%''', 'hr_total_level(p_user, v_st.slot)',
    -- this file's change:
    '''inventory_complete''', 'active_kind not in (''combat'', ''gather'', ''artisan'')',
    'interval ''60 seconds''']
  loop
    if position(v_bad in v_state) = 0 then
      raise exception 'the hr_state_of that landed does not contain "%" — the restatement in §1 is wrong', v_bad;
    end if;
  end loop;

  -- (b) THE TWO PREFIX EXCLUSIONS STILL APPEAR TWICE EACH (agg + truncated
  --     count) — this file did not disturb the progress subquery.
  select count(*) into v_n from regexp_matches(v_state, 'not like ''ev:kill_monster:%''', 'g');
  if v_n <> 2 then raise exception 'ev:kill_monster:%% excluded % times, expected 2', v_n; end if;
  select count(*) into v_n from regexp_matches(v_state, 'not like ''ev:loot:%''', 'g');
  if v_n <> 2 then raise exception 'ev:loot:%% excluded % times, expected 2', v_n; end if;

  -- (c) THE FLAG READS ONLY SERVER-STAMPED STATE, never a client value. The
  --     completeness watermark is accrued_to; there is no 'present'/'complete'
  --     delta key anywhere, and the pointer columns are the only inputs.
  if position('greatest(v_st.accrued_to, v_st.active_since)' in v_state) = 0 then
    raise exception 'inventory_complete does not gate on the accrued_to/active_since watermarks — it may not read the settle loop''s truth';
  end if;

  -- (d) THE RPC IS NOT CLIENT-EXECUTABLE — the whole game if it were.
  for v_missing in select unnest(array['anon', 'authenticated', 'service_role', 'public']) loop
    if has_function_privilege(v_missing, 'public.hr_state_of(uuid,integer)', 'execute') then
      raise exception 'hr_state_of is EXECUTABLE by %', v_missing;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_state_of(uuid,integer)', 'execute') then
    raise exception 'hr_engine cannot execute hr_state_of — every load would 500';
  end if;

  raise notice 'INVENTORY-COMPLETE OK (structural) — field present, gates on accrued_to/active_since, streak/enchant/fight/exclusions intact, RPC not client-executable. Behaviour driven by tests/inventory-complete-probe.mjs.';
end $$;
`;
}

const SELF = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const stateOf = await deriveStateOf();
  if (process.argv.includes('--write')) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(MIG, TARGET), migration(stateOf), 'utf8');
    console.log(`wrote supabase/migrations/${TARGET}`);
  } else if (process.argv.includes('--check')) {
    const mig = (await readFile(join(MIG, TARGET), 'utf8')).replace(/\r\n/g, '\n');
    if (!mig.includes(stateOf)) {
      console.error(`DRIFT: ${TARGET}'s hr_state_of is not what this script derives from ${SRC}.`);
      process.exit(1);
    }
    console.log(`derive-inventory-complete: ${TARGET} matches (hr_state_of ${stateOf.length} B)`);
  } else {
    console.log(stateOf);
  }
}
