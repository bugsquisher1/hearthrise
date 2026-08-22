// ============================================================================
// tests/marks-record.mjs — THE BOUNTY-MARKS RECORD, PROVEN BOTH WAYS.
//
// Server-side correctness of hr_bounty_spend / the marks projection is proven by
// the §5 self-check inside 2026-08-26-marks-record.sql (it runs on every apply).
// This is the CLIENT half: that src/net/record.js + src/net/marks-record.js read
// the marks balance from the server's record under arm and fail-closed to UNKNOWN,
// and that with the arm OFF nothing changes (the balance is still the local one).
//
// Run standalone:  node tests/marks-record.mjs
// Wired into the suite as a preflight (marksRecordGuard).
// ============================================================================
import { fileURLToPath } from 'node:url';
const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function marksRecordGuard() {
  const problems = [];
  const fail = (m) => problems.push('marks-record: ' + m);

  let R, M, A;
  try {
    // ⚠ MATCH THE SPECIFIERS marks-record.js USES. It imports `./record.js?v=NNN`,
    // which record.js resolves against `./accrue.js?v=NNN`. A bare `record.js`
    // here (or a hardcoded ?v=) would be a DIFFERENT module instance whenever the
    // build is bumped, so an arm set on it would not be seen by the accessor under
    // test — exactly the b436 breakage. Derive the CURRENT ?v= from marks-record.js's
    // own source so the test can never drift out of lockstep with a version bump.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('src/net/marks-record.js', ROOT), 'utf8');
    const m = src.match(/record\.js\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    R = await import(mod('src/net/record.js' + v));
    M = await import(mod('src/net/marks-record.js'));
    A = await import(mod('src/net/accrue.js' + v));
  } catch (e) {
    fail('could not load the record modules, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  // Clean seams no matter how the suite left them.
  const reset = () => { try { R.__setMarksRecordArm(null); } catch (e) {} };

  try {
    // ── ARM OFF (default): dormant, no regression ──────────────────────────
    reset();
    if (R.isServerOfRecord('marks')) fail('ARM OFF: `marks` is on the active registry but the flag is off');
    if (R.MARKS_RECORD_ARM_ENABLED !== false) fail('MARKS_RECORD_ARM_ENABLED must ship false (DORMANT)');
    {
      const G = { bountyHunter: { marks: 42 } };
      const b = M.marksOf(G);
      if (!b.known || b.value !== 42 || b.source !== 'local')
        fail('ARM OFF: marksOf must read G.bountyHunter.marks (got ' + JSON.stringify(b) + ')');
      if (M.marksOr(G, 0) !== 42) fail('ARM OFF: marksOr wrong');
      if (!M.canAffordMarks(G, 42) || M.canAffordMarks(G, 43))
        fail('ARM OFF: affordability wrong');
      // absent coalesces to a KNOWN zero, exactly like the live `(bh.marks||0)`.
      const b0 = M.marksOf({ bountyHunter: {} });
      if (!b0.known || b0.value !== 0) fail('ARM OFF: absent marks must be a KNOWN 0');
    }

    // ── ARM ON: server is the only authority ───────────────────────────────
    // The arm ALSO requires the master accrual switch (isRecordActive()).
    A.setServerAccrualEnabled(true);
    const armed = R.__setMarksRecordArm(true);
    if (!armed) { fail('ARM ON: could not arm (master switch not honoured?) — rest skipped'); reset(); A.setServerAccrualEnabled(false); return problems; }
    if (!R.isServerOfRecord('marks')) fail('ARM ON: `marks` not on the active registry');

    // Before any envelope: UNKNOWN, and fail-closed.
    {
      const G = { bountyHunter: { marks: 999 } };   // a forged local value must NOT be read
      const b = M.marksOf(G);
      if (b.known) fail('ARM ON: marks known before any envelope — a local value leaked (' + JSON.stringify(b) + ')');
      if (M.marksNum(G) !== null) fail('ARM ON: marksNum must be null when UNKNOWN');
      if (M.canAffordMarks(G, 1)) fail('ARM ON: canAffordMarks must FAIL-CLOSED on UNKNOWN');
      if (M.fmtMarks(G) !== '—') fail('ARM ON: UNKNOWN must render an em dash, not a number');
    }

    // Apply a server envelope carrying marks → KNOWN from the server.
    {
      const G = {};
      const applied = R.applyRecord(G, { ok: true, version: 5, now: Date.now(), state: { marks: 100 } });
      if (!applied.written || applied.written.indexOf('marks') === -1)
        fail('ARM ON: applyRecord did not write marks from the envelope (' + JSON.stringify(applied) + ')');
      const b = M.marksOf(G);
      if (!b.known || b.value !== 100 || b.source !== 'server')
        fail('ARM ON: marksOf must read the server value 100 (got ' + JSON.stringify(b) + ')');
      // over-spend refused, exact-spend allowed (fail-closed decision form).
      if (M.canAffordMarks(G, 101)) fail('ARM ON: over-spend (101 > 100) must be refused');
      if (!M.canAffordMarks(G, 100)) fail('ARM ON: exact spend (100) must be allowed');
      // a client overwrite of the server value is caught by the b347 fingerprint.
      G.marks = 1e9;
      const b2 = M.marksOf(G);
      if (b2.known) fail('ARM ON: a client-overwritten marks value was vouched for as server truth');
    }

    // An envelope WITHOUT marks leaves it UNKNOWN (fail-closed), never 0.
    {
      const G = {};
      R.applyRecord(G, { ok: true, version: 6, now: Date.now(), state: { gold: 5 } });
      const b = M.marksOf(G);
      if (b.known) fail('ARM ON: a marks-less envelope must leave marks UNKNOWN, not 0');
    }
  } finally {
    reset();
    try { A.setServerAccrualEnabled(false); } catch (e) {}
  }

  return problems;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const probs = await marksRecordGuard();
  if (probs.length) { console.error('FAIL:\n' + probs.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('marks-record: dormant no-regression + armed server-read/fail-closed/over-spend-refused — all green');
}
