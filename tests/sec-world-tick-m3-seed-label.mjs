#!/usr/bin/env node
// ============================================================================
// tests/sec-world-tick-m3-seed-label.mjs
//
// THE STANDING GUARD on the M3 combat channel's seed label
// (SEC_WORLD_TICK_M3_2026-09-22).
//
// Filed by the security-engineer role against `lane/world-tick-m3` at
// 59b748e5 as two FAILING PROOFS. Both defects are now fixed, so the arms are
// GREEN and the file is registered in smoke.yml; the entry in
// tests/guards-unregistered.json is deleted with the same commit.
//
// ⚠ `--mutate` CHANGED MEANING WITH THAT MOVE, and Security's table records the
//   old one. As a proof file the mutant APPLIED the recommended fix and each
//   arm went green (exit 0, arms green). As a standing guard the mutant
//   REINTRODUCES the defect and every arm must go RED — the repo's idiom for
//   world-tick-parity and world-tick-double-pay. It still exits 0, and it still
//   exits 0 for the right reason, but the reason is the opposite one: 0 now
//   means the guard bit. A `--mutate` that comes back green is the guard
//   having gone decorative, and it says so.
//
// WHAT THEY HOLD
//   S-M3-1  EVERY window's seed label is the `hr_state_of` spelling, not just
//           the first. `settleCombatSession` used to re-chain the label from
//           `res.delta.accrued_to`, which accrual.js emits as
//           `new Date(settledTo).toISOString()` — the `...Z`, millisecond
//           spelling Security finding T-2 names — so every window after the
//           first labelled `hr_seed` with a string the accrue path has never
//           used. That is a different RNG stream for every drop roll, crit roll
//           and gold roll on the one channel that mints loot
//           (WORLD_TICK_DESIGN.md 16.3).
//
//           C9 could not see it: it asserted `tick.windows[0]` and took the
//           rest on induction — the same blindness 16.3 attributes to
//           world-tick-parity.mjs, one level up. The helper was right and the
//           CHAIN was not. C9 now asserts every window; this arm is the
//           independent one, because it reads the label at the seam production
//           is handed rather than through the guard's own chain.
//
//           MUTANT: re-chain windows 2..N from the engine's `toISOString()`,
//           exactly as the shipped loop did. The arm must go RED.
//
//   S-M3-2  `pgTimestamptzText` renders what Postgres renders. It used to pad
//           the fraction to six digits; Postgres TRIMS trailing zeros and omits
//           the fraction entirely on an exact second. Asked of a real
//           PostgreSQL (pglite) rather than of a restatement, which is what
//           makes this file the authority on the spelling and lets
//           world-tick-combat-parity.mjs — which has no database — state only
//           the SHAPE. A 10 s cadence lands on an exact second constantly, so
//           `...T12:00:00+00:00` is the common case and not the corner.
//
//           MUTANT: pad to six digits again. The arm must go RED.
// ============================================================================

import { PGlite } from '@electric-sql/pglite';
import {
  loadCombatSessions, atSpan, settleCombatSession, pgTimestamptzText,
} from '../services/world-tick/combat.js';

const MUTATE = process.argv.includes('--mutate');
const FROM_MS = Date.parse('2026-09-18T12:00:00.000Z');
const SPAN_MS = 60_000;
const CADENCE_MS = 10_000;

/* ── WHICH ARMS INVERT UNDER --mutate, AND WHICH MUST NOT ─────────────────
   `ok` is a DEFECT arm: the mutant plants the defect it is filed against, so
   an arm that stays green under the mutant is decorative and the verdict
   inverts (world-tick-double-pay's `judge`).

   `pre` is a HARNESS PRECONDITION — "did this run produce a chain at all" —
   and it is shared with the mutated path. Inverting it would demand that the
   harness BREAK under the mutant, which would then hide a real arm that had
   stopped biting: exactly the 2026-09-12 shape where every arm threw and the
   driver printed "all mutations caught". It never inverts. */
let failures = 0;
let reds = 0;
const ARMS = [];
const pre = (id, cond, msg) => {
  if (cond) { console.log(`  ✓ ${id}${MUTATE ? ' (precondition — does not invert)' : ''}`); return; }
  failures++;
  console.log(`  ✗ ${id} — ${msg}`);
};
const ok = (id, cond, msg) => {
  ARMS.push(id);
  if (!cond) reds++;
  const want = MUTATE ? !cond : cond;
  if (want) { console.log(`  ✓ ${id}${MUTATE ? ' — RED under the mutant, as required' : ''}`); return; }
  failures++;
  if (MUTATE) {
    console.log(`  ✗ ${id} — the mutant planted the defect and this arm STAYED GREEN. `
      + 'A guard that cannot go red is not a guard (CLAUDE.md §4).');
    return;
  }
  console.log(`  ✗ ${id} — ${msg}`);
};

/* The accrue path's spelling, as PostgreSQL itself renders a timestamptz into
   JSONB — which is what `hr_state_of` produces and what index.ts labels with
   (`'accrue:' + String(st.accrued_to)`). Answered by a real server, so this
   file cannot inherit the repo's own opinion about the spelling. */
async function pgRender(db, isoZ) {
  const r = await db.query(
    `select to_jsonb($1::timestamptz) #>> '{}' as t`, [isoZ]);
  return r.rows[0].t;
}

console.log('sec-world-tick-m3-seed-label: the M3 combat channel\'s seed label'
  + (MUTATE ? '  [--mutate: the defect is back; every arm must go RED]' : ''));

const db = await new PGlite();

// ── S-M3-1 ─────────────────────────────────────────────────────────────────
console.log('\nS-M3-1  every window\'s seed label is the hr_state_of rendering');
{
  const session = atSpan(loadCombatSessions()[0], FROM_MS);

  /* The label the loop ACTUALLY resolves per window, captured at the seam the
     production hook is handed — `seedOf(watermarkMs, watermarkText)` — so this
     reads the shipped chain rather than a restatement of it. */
  const labels = [];
  let seenWindows = 0;
  settleCombatSession(session, FROM_MS, FROM_MS + SPAN_MS, {
    cadenceMs: CADENCE_MS,
    seedOf: (wmMs, wmText) => {
      /* THE MUTANT: put the shipped loop back the way it was — windows 2..N
         re-chained from `res.delta.accrued_to`, i.e. the engine's own
         `new Date(ms).toISOString()`. Window 1 is unchanged, because window 1
         was never the defect. Under --mutate the arm must go RED, which is the
         proof that it measures the CHAIN and nothing else. */
      const mutated = MUTATE && seenWindows > 0
        ? new Date(Math.floor(wmMs)).toISOString()
        : wmText;
      seenWindows++;
      labels.push(mutated);
      return 1;
    },
  });

  pre('S-M3-1a', labels.length > 2,
    `only ${labels.length} windows resolved — the arm needs a CHAIN to say anything`);

  /* ISOLATED FROM S-M3-2 ON PURPOSE. This arm asks ONE question: does any
     window carry the `Z` spelling? That is the T-2 defect exactly — the
     engine's `toISOString()` against the accrue path's `+00:00` — and it is
     independent of how many fraction digits either side writes, which is
     S-M3-2's separate question. */
  const zSpelled = labels.filter((t) => /Z$/.test(t));

  ok('S-M3-1b', zSpelled.length === 0,
    `${zSpelled.length} of ${labels.length} windows label hr_seed in the \`...Z\` spelling, `
    + `which the accrue path has never used. The first window carries the envelope's `
    + `rendering and every window after it is re-chained from accrual.js's own `
    + `\`delta.accrued_to\` (new Date(settledTo).toISOString()). One instant, two labels, `
    + `two RNG streams — and on the only channel with rare drop tables that is every `
    + `drop roll (WORLD_TICK_DESIGN.md 16.3, Security T-2).`);

  if (zSpelled.length) {
    console.log(`      window 0     : ${labels[0]}   (the envelope's rendering)`);
    console.log(`      window ${labels.indexOf(zSpelled[0])}+    : ${zSpelled[0]}   (re-chained from delta.accrued_to)`);
    console.log(`      accrue path  : ${await pgRender(db, zSpelled[0])}   (what hr_state_of renders)`);
    console.log(`      root cause   : services/world-tick/combat.js  `
      + `watermarkText = res.delta.accrued_to`);
    console.log('      how it stayed hidden: C9 used to assert tick.windows[0] — the '
      + 'FIRST window — and take the chain on induction. It now asserts every window.');
  }
}

// ── S-M3-2 ─────────────────────────────────────────────────────────────────
console.log('\nS-M3-2  pgTimestamptzText reproduces what PostgreSQL renders');
{
  /* A 10 s cadence puts a watermark on an exact second constantly, and the
     engine's own accrued_to is millisecond precision, so these three are the
     cases the combat channel actually meets. */
  const cases = [
    '2026-09-18T12:00:00.000Z',   // exact second — Postgres emits NO fraction
    '2026-09-18T12:00:09.600Z',   // trailing zeros — Postgres TRIMS them
    '2026-09-18T12:00:09.739Z',   // three significant digits
    '2026-09-18T12:00:10.000Z',   // the cadence's own landing, one window on
  ];
  const bad = [];
  for (const iso of cases) {
    const ms = Date.parse(iso);
    /* THE MUTANT: pad the fraction to six digits again — the helper body this
       arm was filed against. RED under --mutate. */
    const got = MUTATE
      ? new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000+00:00')
      : pgTimestamptzText(ms);
    const want = await pgRender(db, iso);
    if (got !== want) bad.push({ iso, got, want });
  }

  ok('S-M3-2a', bad.length === 0,
    `${bad.length} of ${cases.length} watermarks render differently than PostgreSQL does. `
    + `pgTimestamptzText pads the fraction to six digits; PostgreSQL trims trailing zeros `
    + `and omits the fraction on an exact second. C9's /\\.\\d{6}\\+/ arm enforces the `
    + `padded form, so the guard that is the exit code for T-2 is calibrated to a spelling `
    + `the accrue path cannot produce for a millisecond-precision watermark.`);

  for (const b of bad) {
    console.log(`      ${b.iso}  helper="${b.got}"  postgres="${b.want}"`);
  }
}

await db.close();

if (MUTATE) {
  console.log(`\nsec-world-tick-m3-seed-label --mutate: ${failures === 0
    ? `green — ${reds} of ${ARMS.length} arm(s) went RED with the defect back, so the guard bites`
    : `FAILED — ${failures} arm(s) stayed green under the mutant`}`);
  process.exit(failures === 0 ? 0 : 1);
}
console.log(`\nsec-world-tick-m3-seed-label: ${failures === 0 ? 'green' : `RED — ${failures} arm(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
