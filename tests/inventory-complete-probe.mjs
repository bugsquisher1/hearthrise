#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/inventory-complete-probe.mjs — THE SERVER `inventory_complete` SIGNAL
// (inventory-flip Step B1), END TO END.
//
// THE CLAIM UNDER TEST, in four lines:
//   · a fully-settled / idle character → hr_state_of emits inventory_complete=TRUE;
//   · a payable pointer with an OPEN (>= ACCRUE_MIN_MS) window → FALSE, so an
//     absolute replace can never fire against a baseline that is still missing
//     the pending settle's grants — the data-loss case this whole step exists for;
//   · the same pointer once DRAINED (accrued_to = now, i.e. a settle just ran) →
//     TRUE again;
//   · an inconsistent payable row (no active_since) → FALSE (fail-closed).
//
// Everything runs for real: the WHOLE migration chain (schema-apply-order.json)
// applied verbatim through tests/schema-replay.mjs — so 2026-08-24-inventory-
// complete.sql's own §2 self-check EXECUTES here too — and the REAL hr_state_of
// envelope the client will read.
//
// ── THE SINGLE-SOURCE PIN ────────────────────────────────────────────────
// The SQL literal `interval '60 seconds'` in hr_state_of and the engine's
// ACCRUE_MIN_MS (accrual.js) are the SAME boundary expressed twice; this test
// PINS them together, so a change to one that is not mirrored in the other fails
// the build. It also asserts the exported `inventoryBaselineComplete` mirror
// agrees with the SQL on the full case matrix — the AWAY-1 parity discipline.
//
// Run standalone:  node tests/inventory-complete-probe.mjs
// Also invoked as a guard by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { ACCRUE_MIN_MS, inventoryBaselineComplete } from '../supabase/functions/hr-accrue/accrual.js';

const USER = '00000000-0000-4000-8000-000000000b01';
let PROBLEMS = null;   // when non-null (guard mode), failures are collected not printed
let FAILS = 0;
function ok(cond, msg) {
  if (cond) { if (!PROBLEMS) console.log('  ✓ ' + msg); return; }
  FAILS++;
  if (PROBLEMS) PROBLEMS.push(msg); else console.error('  ✗ ' + msg);
}

// active_since IS nullable (an inconsistent payable row has none); accrued_to is
// NOT NULL, so a null `accrued` means "now" (a freshly-settled watermark).
async function flag(db, { kind = null, id = null, since = null, accrued = null }) {
  await db.query(
    `update public.player_state
        set active_kind = $2,
            active_id   = $3,
            active_since = case when $4::text is null then null else now() - ($4::text)::interval end,
            accrued_to   = case when $5::text is null then now() else now() - ($5::text)::interval end
      where user_id = $1 and slot = 0`,
    [USER, kind, id, since, accrued],
  );
  const r = await db.query('select public.hr_state_of($1::uuid, 0) as e', [USER]);
  const env = r.rows[0].e;
  if (!env || env.ok !== true) throw new Error(`hr_state_of refused: ${JSON.stringify(env)}`);
  return env.inventory_complete;
}

async function main() {
  // ── (1) THE PIN — the SQL threshold IS ACCRUE_MIN_MS, expressed once. ──────
  ok(ACCRUE_MIN_MS === 60000, `ACCRUE_MIN_MS is 60000 (got ${ACCRUE_MIN_MS})`);
  const mig = (await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-24-inventory-complete.sql'), 'utf8'))
    .replace(/\r\n/g, '\n');
  const secs = Math.round(ACCRUE_MIN_MS / 1000);
  ok(mig.includes(`interval '${secs} seconds'`),
    `the migration's completeness threshold is interval '${secs} seconds' — pinned to ACCRUE_MIN_MS`);
  // No OTHER interval literal may sit on the completeness CASE (a second, drifted
  // threshold). The only interval in the whole body besides this one is the
  // 31-day progress window; assert the completeness branch uses exactly the pin.
  ok((mig.match(/greatest\(v_st\.accrued_to, v_st\.active_since\) < interval '(\d+) seconds'/) || [])[1] === String(secs),
    'the completeness comparison uses exactly the pinned threshold and no other');

  // ── (2) THE JS MIRROR AGREES WITH THE SQL ON THE MATRIX ───────────────────
  const now = 1_000_000_000_000;
  const m = ACCRUE_MIN_MS;
  const matrix = [
    ['idle',        { activeKind: 'idle',    activeId: null,  accruedToMs: now - 3600000, activeSinceMs: now - 3600000 }, true],
    ['unknown',     { activeKind: 'farm',    activeId: 'x',   accruedToMs: now - m * 2,   activeSinceMs: now - m * 2 },   true],
    ['open',        { activeKind: 'artisan', activeId: 'f',   accruedToMs: now - m * 2,   activeSinceMs: now - m * 2 },   false],
    ['drained',     { activeKind: 'artisan', activeId: 'f',   accruedToMs: now,           activeSinceMs: now },          true],
    ['no_since',    { activeKind: 'combat',  activeId: 'rat', accruedToMs: now,           activeSinceMs: null },         false],
    ['under_thresh',{ activeKind: 'gather',  activeId: 't',   accruedToMs: now - (m - 1000), activeSinceMs: now - (m - 1000) }, true],
    ['at_thresh',   { activeKind: 'gather',  activeId: 't',   accruedToMs: now - m,       activeSinceMs: now - m },      false],
    ['recent_since',{ activeKind: 'combat',  activeId: 'rat', accruedToMs: now - 3600000, activeSinceMs: now },          true],
  ];
  for (const [label, inp, expect] of matrix) {
    ok(inventoryBaselineComplete({ ...inp, nowMs: now }) === expect,
      `JS mirror: ${label} → ${expect}`);
  }

  // ── (2b) THE RELEASE GATE — nobody arms against a server that does not stamp
  //         the flag. Static, so it runs even where the replay DB cannot boot.
  //         `markInventoryAuthorityLive` MUST refuse (throw) when no complete
  //         envelope has been observed, and `envelopeBaselineComplete` MUST accept
  //         ONLY a literal true. If either guard is deleted, the flip could arm
  //         against a non-emitting server and wipe the bag — so this test is the
  //         thing that fails first. */
  const accrueSrc = (await readFile(join(ROOT, 'src', 'net', 'accrue.js'), 'utf8')).replace(/\r\n/g, '\n');
  ok(/if\s*\(\s*!baselineCompleteSeen\s*\)\s*\{[\s\S]*?throw new Error/.test(accrueSrc),
    'RELEASE GATE: markInventoryAuthorityLive throws unless a complete envelope was observed');
  ok(accrueSrc.includes('res.inventory_complete === true'),
    'RELEASE GATE: envelopeBaselineComplete accepts ONLY a literal inventory_complete === true (fail-closed)');
  // And the flip is still DORMANT — this step must not have armed anything.
  ok(/let\s+inventoryAuthorityLive\s*=\s*false/.test(accrueSrc),
    'RELEASE GATE: inventory authority still defaults OFF (the flip stays dormant)');

  // ── (3) DRIVEN AGAINST THE REAL hr_state_of ───────────────────────────────
  const { db } = await bootReplay({});
  await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [USER]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USER]);
  const c = await db.query('select public.hr_create_character(0) as r');
  if (c.rows[0].r?.ok === false) throw new Error(`hr_create_character failed: ${JSON.stringify(c.rows[0].r)}`);

  // A fresh character is idle → complete.
  ok(await flag(db, { kind: 'idle', id: null, since: null, accrued: null }) === true,
    'DRIVEN: idle character → inventory_complete TRUE');
  // A payable pointer with a 2-minute open window → incomplete (the settle would
  // still pay grants the baseline does not yet hold — the deletion case).
  ok(await flag(db, { kind: 'artisan', id: 'forge_dawn_axe', since: '2 minutes', accrued: '2 minutes' }) === false,
    'DRIVEN: artisan pointer, 2-min open window → inventory_complete FALSE (mid-settle)');
  // The SAME pointer, window drained to now (a settle just ran) → complete.
  ok(await flag(db, { kind: 'artisan', id: 'forge_dawn_axe', since: '0 seconds', accrued: '0 seconds' }) === true,
    'DRIVEN: artisan pointer, window drained to now → inventory_complete TRUE');
  // Fail-closed: payable pointer, no active_since (inconsistent row) → incomplete.
  ok(await flag(db, { kind: 'combat', id: 'rat', since: null, accrued: '0 seconds' }) === false,
    'DRIVEN: payable pointer with no active_since → inventory_complete FALSE (fail-closed)');
  // Boundary: 59s open window → complete; 61s → incomplete (aligns with ACCRUE_MIN_MS).
  ok(await flag(db, { kind: 'gather', id: 'oak', since: '59 seconds', accrued: '59 seconds' }) === true,
    'DRIVEN: 59s window → TRUE (below ACCRUE_MIN_MS)');
  ok(await flag(db, { kind: 'gather', id: 'oak', since: '61 seconds', accrued: '61 seconds' }) === false,
    'DRIVEN: 61s window → FALSE (at/above ACCRUE_MIN_MS)');

  await db.close?.();
}

/** Smoke guard: returns an array of problem strings (empty = pass). Mirrors
 *  goal-counters.mjs's goalCountersGuard shape so run-smoke can await it. */
export async function inventoryCompleteGuard() {
  PROBLEMS = [];
  try { await main(); }
  catch (e) { PROBLEMS.push(`inventory-complete probe threw: ${e && e.message ? e.message : e}`); }
  const out = PROBLEMS; PROBLEMS = null;
  return out;
}

const SELF = import.meta.url.endsWith((process.argv[1] || '').replace(/\\/g, '/').split('/').pop());
if (SELF) {
  main()
    .then(() => {
      if (FAILS) { console.error(`\ninventory-complete-probe: ${FAILS} FAILED`); process.exit(1); }
      console.log('\ninventory-complete-probe: all green');
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
