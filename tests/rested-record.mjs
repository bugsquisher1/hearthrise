// ============================================================================
// tests/rested-record.mjs — THE RESTED RECORD, PROVEN BOTH WAYS.
//
// Server-side correctness of the hr_apply rested write + the hr_state_of
// projection is proven by the §4 self-check inside 2026-08-22-rested-record.sql
// (it runs on every apply: whole-quanta accrual, exact watermark advance,
// idempotent replay, cap + monotone clamps). This is the CLIENT half: that
// src/net/record.js + src/net/rested-record.js read the rested bank from the
// server's record under arm and fail-closed to UNKNOWN, that the count and its
// watermark are COUPLED (both known or neither), and that with the arm OFF nothing
// changes (the bank is still the local one).
//
// Run standalone:  node tests/rested-record.mjs
// Wired into the suite as a preflight (restedRecordGuard).
// ============================================================================
const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function restedRecordGuard() {
  const problems = [];
  const fail = (m) => problems.push('rested-record: ' + m);

  let R, M, A;
  try {
    // ⚠ MATCH THE SPECIFIER rested-record.js USES. Derive the CURRENT ?v= from
    // rested-record.js's OWN source so a version bump (which walks src/ but not
    // tests/) can never split record.js into two module instances — the b436
    // breakage. Copy of marks-record.mjs's derivation.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('src/net/rested-record.js', ROOT), 'utf8');
    const m = src.match(/record\.js\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    R = await import(mod('src/net/record.js' + v));
    M = await import(mod('src/net/rested-record.js'));
    A = await import(mod('src/net/accrue.js' + v));
  } catch (e) {
    fail('could not load the record modules, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  const reset = () => { try { R.__setRestedRecordArm(null); } catch (e) {} };
  const NOW = 1_700_000_000_000;   // a fixed, positive watermark ms

  try {
    /* ── b456: THE SHIPPED DEFAULT IS ARMED, so the const assertion inverts and
       the dormant block is no longer reachable via `reset()`. Both positions are
       still held: the ARM is the contract (a revert re-opens a forgeable,
       client-authored value), and the dormant fall-through is the kill-switch
       position, driven explicitly through the seam rather than assumed. */
    reset();
    if (R.RESTED_RECORD_ARM_ENABLED !== true) fail('RESTED_RECORD_ARM_ENABLED must ship true (ARMED) — a revert '
      + 'puts the Rested bank and its watermark back in the client-authored save blob');

    // ── ARM OFF (seam-forced): dormant, no regression ──────────────────────
    R.__setRestedRecordArm(false);
    if (R.isServerOfRecord('restedXp')) fail('ARM OFF: `restedXp` is on the active registry but the flag is off');
    if (R.isServerOfRecord('restedAt')) fail('ARM OFF: `restedAt` is on the active registry but the flag is off');
    {
      const G = { restedXp: 7, restedAt: NOW };
      const b = M.restedOf(G);
      if (!b.known || b.xp !== 7 || b.at !== NOW || b.source !== 'local')
        fail('ARM OFF: restedOf must read G.restedXp/G.restedAt (got ' + JSON.stringify(b) + ')');
      if (M.restedCharges(G) !== 7) fail('ARM OFF: restedCharges wrong');
      if (M.restedChargesOr(G, 0) !== 7) fail('ARM OFF: restedChargesOr wrong');
      // absent count coalesces to a KNOWN zero, like the live `(G.restedXp||0)`.
      const b0 = M.restedOf({});
      if (!b0.known || b0.xp !== 0) fail('ARM OFF: absent restedXp must be a KNOWN 0');
    }

    // ── ARM ON: server is the only authority ───────────────────────────────
    A.setServerAccrualEnabled(true);
    const armed = R.__setRestedRecordArm(true);
    if (!armed) { fail('ARM ON: could not arm (master switch not honoured?) — rest skipped'); reset(); A.setServerAccrualEnabled(false); return problems; }
    if (!R.isServerOfRecord('restedXp') || !R.isServerOfRecord('restedAt'))
      fail('ARM ON: rested entries not on the active registry');
    // BOTH entries share ONE flag → the strip removes both.
    if (R.serverOfRecordFields().indexOf('restedXp') === -1 || R.serverOfRecordFields().indexOf('restedAt') === -1)
      fail('ARM ON: both rested fields must be strippable');

    // Before any envelope: UNKNOWN, and fail-closed — a forged local value must NOT leak.
    {
      const G = { restedXp: 999, restedAt: NOW };
      const b = M.restedOf(G);
      if (b.known) fail('ARM ON: rested known before any envelope — a local value leaked (' + JSON.stringify(b) + ')');
      if (M.restedCharges(G) !== null) fail('ARM ON: restedCharges must be null when UNKNOWN');
    }

    // A full server envelope carrying BOTH → KNOWN from the server.
    {
      const G = {};
      const applied = R.applyRecord(G, { ok: true, version: 5, now: NOW,
        state: { rested_xp: 40, rested_at: new Date(NOW).toISOString() } });
      if (!applied.written || applied.written.indexOf('restedXp') === -1 || applied.written.indexOf('restedAt') === -1)
        fail('ARM ON: applyRecord did not write BOTH rested fields (' + JSON.stringify(applied) + ')');
      const b = M.restedOf(G);
      if (!b.known || b.xp !== 40 || b.source !== 'server')
        fail('ARM ON: restedOf must read the server value 40 (got ' + JSON.stringify(b) + ')');
      if (typeof b.at !== 'number' || Math.abs(b.at - NOW) > 1000)
        fail('ARM ON: restedAt watermark must decode to ~' + NOW + ' (got ' + b.at + ')');
      // a client overwrite of the server count is caught by the b347 fingerprint.
      G.restedXp = 1e6;
      if (M.restedOf(G).known) fail('ARM ON: a client-overwritten restedXp was vouched for as server truth');
    }

    // COUPLING: an envelope carrying ONLY the count (no watermark) leaves the
    // WHOLE bank UNKNOWN, never a half-known number.
    {
      const G = {};
      R.applyRecord(G, { ok: true, version: 6, now: NOW, state: { rested_xp: 12 } });
      const b = M.restedOf(G);
      if (b.known) fail('ARM ON: a watermark-less envelope must leave the bank UNKNOWN (both-or-neither)');
    }

    // A zero-epoch / garbage watermark decodes to UNKNOWN, never "1970" (which
    // would mint a full bank on the next spend).
    {
      const G = {};
      R.applyRecord(G, { ok: true, version: 7, now: NOW, state: { rested_xp: 5, rested_at: 0 } });
      if (M.restedOf(G).known) fail('ARM ON: a zero-epoch watermark must be UNKNOWN, not banked at 1970');
    }
  } finally {
    reset();
    try { A.setServerAccrualEnabled(false); } catch (e) {}
  }

  return problems;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const probs = await restedRecordGuard();
  if (probs.length) { console.error('FAIL:\n' + probs.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('rested-record: dormant no-regression + armed server-read/fail-closed/coupled/watermark-safe — all green');
}
