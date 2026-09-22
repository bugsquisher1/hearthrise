#!/usr/bin/env node
// ============================================================================
// tests/sec-world-tick-m3-seed-label.mjs
//
// SECURITY PROOF ARMS for the M3 combat channel (SEC_WORLD_TICK_M3_2026-09-22).
// These are FAILING PROOFS, filed by the security-engineer role against
// `lane/world-tick-m3` at 59b748e5. They are not a fix: lane code is untouched.
//
// WHAT THEY PROVE
//   S-M3-1  The seed label is the `hr_state_of` spelling for the FIRST window
//           of a session ONLY. `settleCombatSession` re-chains the label from
//           `res.delta.accrued_to`, which accrual.js emits as
//           `new Date(settledTo).toISOString()` — the `...Z`, millisecond
//           spelling that Security finding T-2 names. Every window after the
//           first therefore labels `hr_seed` with a string the accrue path has
//           never used, which is a different RNG stream for every drop roll,
//           crit roll and gold roll on the one channel that mints loot
//           (WORLD_TICK_DESIGN.md 16.3).
//
//           C9 does not see this because it asserts `tick.windows[0]` — the
//           first window — and takes the rest on induction. That is the same
//           class of blindness 16.3 attributes to world-tick-parity.mjs, one
//           level up: the helper is right, the CHAIN is not.
//
//   S-M3-2  `pgTimestamptzText` is not what Postgres renders. It pads the
//           fraction to six digits; Postgres TRIMS trailing zeros and omits
//           the fraction entirely on an exact second. Checked against a real
//           PostgreSQL (pglite), not against a restatement. The offline
//           fixture spelling `...T12:00:09.600000+00:00` is therefore one
//           production cannot emit for a millisecond-precision watermark, and
//           C9's `/\.\d{6}\+/` arm ENFORCES that unreachable spelling — so the
//           guard that is the exit code for T-2 is calibrated to a string the
//           accrue path will never label with. A 10 s cadence lands on exact
//           seconds constantly, which is the `...T12:00:00+00:00` case.
//
// Each arm carries its own MUTATION PROOF (`--mutate`): the mutant makes the
// arm pass, which is how you know the arm is measuring the thing it names.
// ============================================================================

import { PGlite } from '@electric-sql/pglite';
import {
  loadCombatSessions, atSpan, settleCombatSession, pgTimestamptzText,
} from '../services/world-tick/combat.js';

const MUTATE = process.argv.includes('--mutate');
const FROM_MS = Date.parse('2026-09-18T12:00:00.000Z');
const SPAN_MS = 60_000;
const CADENCE_MS = 10_000;

let failures = 0;
const ok = (id, cond, msg) => {
  if (cond) { console.log(`  ✓ ${id}`); return; }
  failures++;
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

console.log('sec-world-tick-m3-seed-label: Security proof arms for the M3 combat channel'
  + (MUTATE ? '  [--mutate: each arm must now PASS]' : ''));

const db = await new PGlite();

// ── S-M3-1 ─────────────────────────────────────────────────────────────────
console.log('\nS-M3-1  every window\'s seed label is the hr_state_of rendering');
{
  const session = atSpan(loadCombatSessions()[0], FROM_MS);

  /* The label the loop ACTUALLY resolves per window, captured at the seam the
     production hook is handed — `seedOf(watermarkMs, watermarkText)` — so this
     reads the shipped chain rather than a restatement of it. */
  const labels = [];
  settleCombatSession(session, FROM_MS, FROM_MS + SPAN_MS, {
    cadenceMs: CADENCE_MS,
    seedOf: (wmMs, wmText) => {
      /* THE MUTANT: re-render the watermark in the accrue path's spelling
         before labelling, which is what the loop would do if it did not chain
         the engine's own ISO string. Under --mutate the arm goes green, which
         is the proof that the arm measures the chaining and nothing else. */
      labels.push(MUTATE ? pgTimestamptzText(wmMs) : wmText);
      return 1;
    },
  });

  ok('S-M3-1a', labels.length > 2,
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
    console.log(`      why C9 is green: it asserts tick.windows[0] — the FIRST window — `
      + `and takes the chain on induction.`);
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
  ];
  const bad = [];
  for (const iso of cases) {
    const ms = Date.parse(iso);
    /* THE MUTANT: ask PostgreSQL instead of the repo helper, which is exactly
       the fix this arm recommends. Green under --mutate. */
    const got = MUTATE ? await pgRender(db, iso) : pgTimestamptzText(ms);
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

console.log(`\nsec-world-tick-m3-seed-label: ${failures === 0 ? 'green' : `RED — ${failures} arm(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
