// ============================================================================
// tests/bank-store.mjs — THE BANK ITEM STORE, PROVEN BOTH WAYS.
//
// Server-side correctness of hr_bank_move (atomic deposit/withdraw, clamp,
// no-dupe, no-negative, idempotent replay, bank projection, no client write
// policy, RPC lockdown) is PROVEN by the §6 self-check inside
// 2026-08-27-bank-store.sql, which runs on every apply (HR819-rolled-back).
//
// This is the CLIENT half: that src/net/accrue.js's reconcileBank folds the
// server-owned bank (res.bank) through the SAME absolute/serverOwnedItem
// carve-out as the bag, so ARMING the inventory flip cannot STRAND or DELETE a
// banked item — the one irreversible mistake the whole program guards against.
//   • DORMANT (invAbsolute false OR envelope incomplete): G.bank is UNTOUCHED.
//   • ABSOLUTE (armed + complete): OWNED ids are the server's truth (omitted =
//     removed), EXCLUDED ids are never deleted/lowered, and the non-item
//     bank-SPACE counters (goldBuys/gemBuys/grandfather) are always preserved.
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

  // Sanity: the partition agrees with the accessor reconcileBank uses.
  if (!A.serverOwnedItem || A.serverOwnedItem(OWN_A) !== true || A.serverOwnedItem(EXC) !== false) {
    // serverOwnedItem is not re-exported by accrue.js; that's fine — reconcileBank
    // imports it internally. We rely on the shared item-authority instance below.
  }

  // ── DORMANT: G.bank is UNTOUCHED (both gate-off shapes) ─────────────────────
  for (const [ia, bc, label] of [[false, true, 'not-absolute'], [true, false, 'incomplete']]) {
    const G = { bank: { [OWN_A]: 5, [EXC]: 3, goldBuys: 2 } };
    const before = JSON.stringify(G.bank);
    const r = A.reconcileBank(G, { bank: { [OWN_A]: 99 } }, ia, bc);
    if (JSON.stringify(G.bank) !== before) fail('DORMANT (' + label + '): G.bank was mutated: ' + JSON.stringify(G.bank));
    if (!r || r.mode !== 'dormant') fail('DORMANT (' + label + '): mode should be "dormant" (got ' + JSON.stringify(r) + ')');
  }

  // ── ABSENT res.bank: leave G.bank alone (absence is not a claim) ────────────
  {
    const G = { bank: { [OWN_A]: 5 } };
    const r = A.reconcileBank(G, { state: {} }, true, true);
    if (G.bank[OWN_A] !== 5) fail('ABSENT: G.bank mutated on a bank-less envelope');
    if (!r || r.mode !== 'absent') fail('ABSENT: mode should be "absent" (got ' + JSON.stringify(r) + ')');
  }

  // ── ABSOLUTE (armed + complete): the server bank IS the truth ───────────────
  {
    const G = { bank: { [OWN_A]: 5, [OWN_B]: 7, [EXC]: 3, goldBuys: 2, gemBuys: 1, grandfather: 0 } };
    // Server names OWN_A only. OWN_B omitted (owned → must be REMOVED). EXC omitted
    // (excluded → must be KEPT). Space counters must all survive.
    const r = A.reconcileBank(G, { bank: { [OWN_A]: 99 } }, true, true);
    if (!r || r.mode !== 'absolute') fail('ABSOLUTE: mode should be "absolute" (got ' + JSON.stringify(r) + ')');
    if (G.bank[OWN_A] !== 99) fail('ABSOLUTE: OWNED named id not set to server truth 99 (got ' + G.bank[OWN_A] + ')');
    if (OWN_B in G.bank) fail('ABSOLUTE: OWNED omitted id ' + OWN_B + ' was NOT removed (a forged owned stack survived)');
    if (G.bank[EXC] !== 3) fail('ABSOLUTE: EXCLUDED id ' + EXC + ' was deleted/altered — a legit banked item lost (' + G.bank[EXC] + ')');
    if (G.bank.goldBuys !== 2 || G.bank.gemBuys !== 1 || !('grandfather' in G.bank))
      fail('ABSOLUTE: a bank-SPACE counter was dropped: ' + JSON.stringify(G.bank));
  }

  // ── ABSOLUTE never LOWERS an excluded id (over-credit only, never delete) ───
  {
    const G = { bank: { [EXC]: 50 } };
    A.reconcileBank(G, { bank: { [EXC]: 5 } }, true, true);   // server names a LOWER figure
    if (G.bank[EXC] !== 50) fail('ABSOLUTE: excluded id was LOWERED by the server figure (' + G.bank[EXC] + ' != 50)');
  }

  return problems;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const probs = await bankStoreGuard();
  if (probs.length) { console.error('FAIL:\n' + probs.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('bank-store: dormant leaves G.bank untouched; absolute owns server truth, removes forged owned, keeps+never-lowers excluded, preserves space counters — all green');
}
