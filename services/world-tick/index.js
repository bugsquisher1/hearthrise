// ============================================================================
// services/world-tick/index.js — the SHADOW WORLD TICK, runnable.
//
//   node services/world-tick/index.js                 60 windows, 10 s cadence
//   node services/world-tick/index.js --minutes=30 --cadence=5
//   node services/world-tick/index.js --json          machine-readable output
//
// This is step 1 of docs/planning/LIVE_WORLD_BRIEF.md's sequence and it is
// DELIBERATELY INERT. It proves the process model (one Node process, a clock, a
// character set, the engines, a proposed delta per window) without being
// allowed to affect anything:
//
//   · no Supabase client, no `fetch`, no socket, no service-role key;
//   · characters come from a JSON fixture validated against src/data;
//   · every window's output is a PROPOSED delta that is printed and discarded.
//
// The shape it is rehearsing is the one the design doc specifies: the tick
// computes a proposed delta and a single SECURITY DEFINER RPC decides whether
// it may land. Step 2 replaces `console.log` with that RPC call and nothing
// else in this file changes.
//
// PURE ESM, Node. No `?v=` (not under src/**).
// ============================================================================

import { loadFixtures, atSpan, CATALOGUES } from './fixtures.js';
import { shadowSpan } from './shadow.js';
import { foldDeltas, timeSummary } from './contract.js';

const arg = (name, dflt) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : dflt;
};
const JSON_OUT = process.argv.includes('--json');

const CADENCE_MS = Math.max(1000, Math.floor(arg('cadence', 10) * 1000));
const MINUTES = Math.max(1, Math.floor(arg('minutes', 10)));

/* THE SERVER CLOCK, and the only place the spike is allowed to read one.
   Fixed here so a run is reproducible; in production it is `Date.now()` on the
   tick host and `now()` inside every RPC — never a client value, never a
   fixture value. The design doc's "clock" section states why the two must be
   the same instant to within one cadence and what happens when they are not. */
const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const TO_MS = FROM_MS + MINUTES * 60000;

const report = [];
for (const f of loadFixtures()) {
  const c = atSpan(f, FROM_MS);
  const run = shadowSpan(c, FROM_MS, TO_MS, CATALOGUES, { cadenceMs: CADENCE_MS });
  const paid = run.results.filter((r) => r.res.accrued);
  const refused = run.results.filter((r) => !r.res.accrued);
  const folded = foldDeltas(paid.map((r) => r.res.delta));
  const time = run.results.reduce((a, r) => a + timeSummary(r.res).ticks, 0);
  report.push({
    character: c.name,
    combatTickMs: run.tickMs,
    cadenceMs: CADENCE_MS,
    windows: run.windows.length,
    settled: paid.length,
    refused: refused.length,
    refusalReasons: [...new Set(refused.map((r) => r.res.reason))],
    simulatedTicks: time,
    proposed: { gold: folded.gold || 0, xp: folded.xp || {}, items: folded.items || {} },
    wroteAnything: false,     // shadow mode. The whole point.
  });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ fromMs: FROM_MS, toMs: TO_MS, cadenceMs: CADENCE_MS, report }, null, 2));
} else {
  console.log(`world-tick (SHADOW) — ${MINUTES} min of world time, ${CADENCE_MS / 1000}s cadence, ${report.length} characters`);
  console.log('nothing below was written anywhere; these are PROPOSED deltas.\n');
  for (const r of report) {
    console.log(`  ${r.character}`);
    console.log(`    combat tick ${r.combatTickMs}ms · ${r.windows} windows · ${r.settled} settled · ${r.refused} refused ${r.refusalReasons.length ? '(' + r.refusalReasons.join(', ') + ')' : ''}`);
    console.log(`    simulated ${r.simulatedTicks} combat ticks`);
    console.log(`    proposed  gold +${r.proposed.gold} · xp ${JSON.stringify(r.proposed.xp)} · items ${JSON.stringify(r.proposed.items)}`);
  }
  console.log('\nparity against accrual-on-return: node tests/world-tick-parity.mjs');
}
