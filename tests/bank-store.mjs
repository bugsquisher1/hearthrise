// ============================================================================
// tests/bank-store.mjs — THE BANK ITEM STORE, PROVEN BOTH WAYS.
//
// Server-side correctness of hr_bank_move (atomic deposit/withdraw, clamp,
// no-dupe, no-negative, idempotent replay, bank projection, no client write
// policy, RPC lockdown) is PROVEN by the §6 self-check inside
// 2026-08-27-bank-store.sql, which runs on every apply (HR819-rolled-back).
//
// This is the CLIENT half: that src/net/accrue.js's reconcileBank folds the
// server-owned Depot (`res.bank`) on ITS OWN authority.
//
// ⚠ WHAT THIS GUARD PINNED UNTIL b544, AND WHY IT WAS WRONG. It asserted that
// the fold is DORMANT (G.bank untouched) whenever the BAG's arm is off — which
// is prod — and that an EXCLUDED id is never lowered. Both shipped a Depot that
// could not work: live b544, QA slot 2, the panel read "The realm has not sent
// your Depot yet" over an envelope that carried `bank: {}` on every settle, and a
// deposit the server ACCEPTED (one hr_bank_move → 200, ledger row written) could
// not appear anywhere. `player_bank` has no client write policy and exactly one
// writer under the per-character lock, and hr_state_of coalesces the projection
// to `'{}'`, so a readable `bank` object is a complete statement of the whole
// container and is believed in BOTH directions for every key. Keeping the bag's
// never-delete carve-out here was the withdraw half of the same bug.
//
// PINNED HERE:
//   • a readable `res.bank` ⇒ mode 'absolute', REGARDLESS of the bag's arm or the
//     envelope's inventory-completeness flag (the b544 regression);
//   • every item key absolute both ways: named sets the qty, omitted removes the
//     stack, and that holds for an EXCLUDED id as much as an OWNED one;
//   • the non-item bank-SPACE counters (goldBuys/gemBuys/grandfather) survive;
//   • absent/garbage `res.bank` ⇒ mode 'absent', G.bank untouched (absence is
//     not a claim of zero), and the observed mode is stamped by the FOLD so the
//     boot hr_load door records it too.
//
// Run standalone:  node tests/bank-store.mjs
// Wired into run-smoke as a preflight (bankStoreGuard).
// ============================================================================
const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function bankStoreGuard() {
  const problems = [];
  const fail = (m) => problems.push('bank-store: ' + m);

  let A, IA;
  try {
    // Derive the CURRENT ?v= from accrue.js's OWN import of item-authority.js so
    // the test shares ONE item-authority instance with the module under test — a
    // hardcoded / bumped-away ?v= would split it into two partitions and the
    // serverOwnedItem the test reads would not be the one reconcileBank uses.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('src/net/accrue.js', ROOT), 'utf8');
    const m = src.match(/item-authority\.js\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    A = await import(mod('src/net/accrue.js' + v));
    IA = await import(mod('src/data/item-authority.js' + v));
  } catch (e) {
    fail('could not load accrue.js / item-authority.js, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  // Pick REAL ids from the live partition (never hardcoded), so the test tracks
  // the data, not a snapshot of it: two OWNABLE ids and one EXCLUDED id.
  const part = IA.itemAuthority();
  const owned = [...part.ownable];
  const excluded = [...part.excluded].filter((id) => !part.ownable.has(id));
  if (owned.length < 2) { fail('need >=2 ownable ids to test (got ' + owned.length + ')'); return problems; }
  if (excluded.length < 1) { fail('need >=1 excluded id to test'); return problems; }
  const OWN_A = owned[0], OWN_B = owned[1], EXC = excluded[0];

  // ── THE b544 REGRESSION: the Depot does NOT wait for the bag's arm ──────────
  // reconcileBank takes (G, res) and nothing else. The old signature carried the
  // bag's two gates; extra arguments must be IGNORED, not honoured, so a stale
  // caller cannot put the Depot back to sleep.
  if (A.reconcileBank.length !== 2) {
    fail('reconcileBank takes ' + A.reconcileBank.length + ' arguments — the Depot folds on (G, res) alone; a gate parameter is how it slept through b544');
  }
  {
    const G = { bank: { [OWN_A]: 5, goldBuys: 2 } };
    // The two shapes that used to mean DORMANT: bag arm off, envelope incomplete.
    const r = A.reconcileBank(G, { bank: { [OWN_A]: 99 }, inventory_complete: false }, false, false);
    if (!r || r.mode !== 'absolute') fail('BAG ARM OFF: mode is ' + JSON.stringify(r) + ' — the Depot must fold on its own authority (the live b544 P1: "the realm has not sent your Depot yet", forever)');
    if (G.bank[OWN_A] !== 99) fail('BAG ARM OFF: the server figure was not applied (' + G.bank[OWN_A] + ' != 99)');
    if (A.lastBankFoldMode() !== 'absolute') fail('BAG ARM OFF: the observed fold mode is "' + A.lastBankFoldMode() + '" — the Depot panel reads this to decide whether to say "empty" or "not sent yet"');
  }

  // ── AN EMPTY PROJECTION IS A REAL ZERO, not "not sent yet" ─────────────────
  {
    const G = { bank: { [OWN_A]: 5, [EXC]: 3, goldBuys: 1 } };
    const r = A.reconcileBank(G, { bank: {} });
    if (!r || r.mode !== 'absolute') fail('EMPTY: mode should be "absolute" (got ' + JSON.stringify(r) + ')');
    if (OWN_A in G.bank || EXC in G.bank) fail('EMPTY: `bank: {}` left stacks behind: ' + JSON.stringify(G.bank) + ' — an empty projection is a complete statement');
    if (G.bank.goldBuys !== 1) fail('EMPTY: a bank-SPACE counter was dropped: ' + JSON.stringify(G.bank));
  }

  // ── ABSENT / GARBAGE res.bank: leave G.bank alone (absence is not a claim) ──
  for (const [res, label] of [[{ state: {} }, 'absent'], [{ bank: [1, 2] }, 'array'], [{ bank: null }, 'null']]) {
    const G = { bank: { [OWN_A]: 5 } };
    const r = A.reconcileBank(G, res);
    if (G.bank[OWN_A] !== 5) fail('ABSENT (' + label + '): G.bank mutated on an envelope that stated no bank');
    if (!r || r.mode !== 'absent') fail('ABSENT (' + label + '): mode should be "absent" (got ' + JSON.stringify(r) + ')');
    if (A.lastBankFoldMode() !== 'absent') fail('ABSENT (' + label + '): fold mode is "' + A.lastBankFoldMode() + '"');
  }

  // ── ABSOLUTE, EVERY KEY, BOTH DIRECTIONS ───────────────────────────────────
  {
    const G = { bank: { [OWN_A]: 5, [OWN_B]: 7, [EXC]: 50, goldBuys: 2, gemBuys: 1, grandfather: 0 } };
    // Server names OWN_A (raise) and EXC (LOWER — a withdraw); OWN_B omitted.
    const r = A.reconcileBank(G, { bank: { [OWN_A]: 99, [EXC]: 5 } });
    if (!r || r.mode !== 'absolute') fail('ABSOLUTE: mode should be "absolute" (got ' + JSON.stringify(r) + ')');
    if (G.bank[OWN_A] !== 99) fail('ABSOLUTE: OWNED named id not set to server truth 99 (got ' + G.bank[OWN_A] + ')');
    if (OWN_B in G.bank) fail('ABSOLUTE: OWNED omitted id ' + OWN_B + ' was NOT removed (a forged owned stack survived)');
    if (G.bank[EXC] !== 5) fail('ABSOLUTE: EXCLUDED id ' + EXC + ' was not LOWERED to the server figure (' + G.bank[EXC] + ' != 5) — a withdraw the server committed must leave the Depot column');
    if (G.bank.goldBuys !== 2 || G.bank.gemBuys !== 1 || !('grandfather' in G.bank))
      fail('ABSOLUTE: a bank-SPACE counter was dropped: ' + JSON.stringify(G.bank));
  }

  // ── AN UNREADABLE FIGURE IS NOT A QUANTITY ────────────────────────────────
  {
    const G = { bank: { [OWN_A]: 5 } };
    A.reconcileBank(G, { bank: { [OWN_A]: 'lots', [OWN_B]: -3 } });
    if (OWN_A in G.bank || OWN_B in G.bank) fail('GARBAGE FIGURE: a non-positive/unreadable figure became a stack: ' + JSON.stringify(G.bank));
  }

  // ── THE BAG SIDE OF A CONFIRMED MOVE (noteServerBagMove) ───────────────────
  // The seam must exist, must refuse a forged id, and must be bounded — a hold
  // that never drains would suppress a real stack for a whole session.
  if (typeof A.noteServerBagMove !== 'function' || typeof A.__serverBagMoves !== 'function') {
    fail('noteServerBagMove/__serverBagMoves are unpublished — a deposit the server committed cannot leave the bag, so the player stores a stack and watches nothing happen');
  } else {
    A.__serverBagMoves().slice();                 // read is non-draining
    if (A.noteServerBagMove('NOT AN ID!') !== false) fail('noteServerBagMove accepted a malformed id');
    A.noteServerBagMove(OWN_A);
    if (A.__serverBagMoves().indexOf(OWN_A) < 0) fail('noteServerBagMove did not record ' + OWN_A);
    // Drained by the next envelope that STATES the bag, and only that.
    const G = { bank: {}, inventory: { [OWN_A]: 876 } };
    A.reconcileInventory(G, { bank: {} }, false, false);
    if (A.__serverBagMoves().indexOf(OWN_A) < 0) fail('an envelope with NO inventory projection consumed the confirmed-move note — absence is not a statement');
    A.reconcileInventory(G, { inventory: { [OWN_A]: 866 } }, false, false);
    if (G.inventory[OWN_A] !== 866) fail('the bag kept ' + G.inventory[OWN_A] + ' after the server confirmed the move and stated 866 — the merge max is exactly the live b544 symptom ("bones stayed 876")');
    if (A.__serverBagMoves().length) fail('the confirmed-move note was not drained: ' + JSON.stringify(A.__serverBagMoves()));
    // And with no note, the bag stays a ratchet (nothing else changed).
    const H = { inventory: { [OWN_A]: 876 } };
    A.reconcileInventory(H, { inventory: { [OWN_A]: 866 } }, false, false);
    if (H.inventory[OWN_A] !== 876) fail('the merge branch lowered a bag figure with NO confirmed move — this fold must stay a ratchet for everything else (' + H.inventory[OWN_A] + ')');
  }

  return problems;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const probs = await bankStoreGuard();
  if (probs.length) { console.error('FAIL:\n' + probs.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('bank-store: the Depot folds on its own authority (bag arm irrelevant), every key absolute both ways, counters preserved, absence untouched, a confirmed move leaves the bag once — all green');
}
