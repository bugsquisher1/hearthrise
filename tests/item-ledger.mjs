// ============================================================================
// tests/item-ledger.mjs — THE QUARTERMASTER TRADE LEDGER, DRIVEN FROM NODE.
//
// Guards src/net/item-ledger.js, which exists because of the live P0 of
// 2026-08-18 (Xarnathos): "when you buy e.g. a blueprint, you will get the
// dungeon scrip back after a short amount of time. You can buy every blueprint
// with minimum 160 scrip."
//
// The browser suite carries the end-to-end assertion (B372-SCRIP-1, which drives
// the REAL `applyEnvelopeState`). This file drives the pure module directly,
// which is what makes the two properties that actually matter cheap to state
// exhaustively rather than by example:
//
//   · THE LEDGER NEVER MINTS. Case 6 fuzzes 36 envelope shapes — including
//     NaN, negative and absurd figures — against a recorded trade and asserts
//     no bag ever grows or goes negative. A correction that can mint is worse
//     than the bug it corrects, and that is the whole reason `reconcile`
//     reverts rather than re-applying.
//   · THE TWO BRANCHES AGREE. Cases 1 and 3 run the merge shape and the
//     absolute shape and require the same end state, so the b366 flip cannot
//     silently change what a purchase does.
//
//   node tests/item-ledger.mjs
// ============================================================================

import * as L from '../src/net/item-ledger.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fails++; };

// 1. MERGE branch shape: envelope names scrip at the pre-purchase figure,
//    omits the blueprint. The bug: scrip refunded, blueprint kept.
{
  const G = { inventory: { dungeon_scrip: 40, kitchen_blueprint_t3: 1 } };
  L.record(G, { dungeon_scrip: 160 }, { kitchen_blueprint_t3: 1 }, 'qm');
  // simulate the merge write: max(40,200)=200; blueprint omitted -> left alone
  G.inventory.dungeon_scrip = 200;
  const r = L.reconcile(G, { inventory: { dungeon_scrip: 200 } });
  ok(G.inventory.dungeon_scrip === 200, 'merge: scrip refunded to 200 (envelope wins)');
  ok(!G.inventory.kitchen_blueprint_t3, 'merge: blueprint taken back with it — NO FREE BLUEPRINT');
  ok(r.reverted === 1 && r.took.kitchen_blueprint_t3 === 1, 'merge: reported one revert');
  ok(G.pendingItemSpends.length === 0, 'merge: entry retired');
}
// 2. Repeat settles are a no-op (idempotence).
{
  const G = { inventory: { dungeon_scrip: 200 } , pendingItemSpends: [] };
  for (let i = 0; i < 5; i++) L.reconcile(G, { inventory: { dungeon_scrip: 200 } });
  ok(G.inventory.dungeon_scrip === 200, 'idempotent across repeat settles');
}
// 3. ABSOLUTE branch: bag replaced wholesale (blueprint already deleted).
{
  const G = { inventory: { dungeon_scrip: 40, forge_blueprint_t3: 1 } };
  L.record(G, { dungeon_scrip: 160 }, { forge_blueprint_t3: 1 }, 'qm');
  G.inventory = { dungeon_scrip: 200 };            // absolute replace
  L.reconcile(G, { inventory: { dungeon_scrip: 200 } });
  ok(G.inventory.dungeon_scrip === 200 && !G.inventory.forge_blueprint_t3,
    'absolute: same end state as merge — the two branches agree');
}
// 4. The server CAUGHT UP -> the trade is real, nothing is touched, entry drains.
{
  const G = { inventory: { dungeon_scrip: 40, kitchen_blueprint_t3: 1 } };
  L.record(G, { dungeon_scrip: 160 }, { kitchen_blueprint_t3: 1 }, 'qm');
  L.reconcile(G, { inventory: { dungeon_scrip: 40, kitchen_blueprint_t3: 1 } });
  ok(G.inventory.kitchen_blueprint_t3 === 1 && G.inventory.dungeon_scrip === 40,
    'settled: a trade the server confirms is left alone');
  ok(G.pendingItemSpends.length === 0, 'settled: entry retired (drains when the verb ships)');
}
// 5. Envelope says nothing -> keep waiting, bag untouched.
{
  const G = { inventory: { dungeon_scrip: 40, kitchen_blueprint_t3: 1 } };
  L.record(G, { dungeon_scrip: 160 }, { kitchen_blueprint_t3: 1 }, 'qm');
  L.reconcile(G, { inventory: { ember_bar: 3 } });
  ok(G.pendingItemSpends.length === 1, 'silent envelope: entry kept');
  ok(G.inventory.kitchen_blueprint_t3 === 1, 'silent envelope: bag untouched');
}
// 6. NEVER MINTS. Fuzz every envelope shape against a recorded trade.
{
  let minted = false;
  for (const scrip of [undefined, 0, 40, 159, 160, 200, NaN, -5, 1e9]) {
    for (const bp of [undefined, 0, 1, 2]) {
      const G = { inventory: { dungeon_scrip: 40, kitchen_blueprint_t3: 1 } };
      L.record(G, { dungeon_scrip: 160 }, { kitchen_blueprint_t3: 1 }, 'qm');
      const env = { inventory: {} };
      if (scrip !== undefined) env.inventory.dungeon_scrip = scrip;
      if (bp !== undefined) env.inventory.kitchen_blueprint_t3 = bp;
      L.reconcile(G, env);
      if ((G.inventory.kitchen_blueprint_t3 || 0) > 1 || (G.inventory.dungeon_scrip || 0) > 40) minted = true;
      if ((G.inventory.kitchen_blueprint_t3 || 0) < 0 || (G.inventory.dungeon_scrip || 0) < 0) minted = true;
    }
  }
  ok(!minted, 'fuzz: no envelope shape makes the ledger mint or go negative (36 cases)');
}
// 7. Bounded.
{
  const G = { inventory: {} };
  for (let i = 0; i < 500; i++) L.record(G, { dungeon_scrip: 1 }, { bone_key: 1 }, 'qm');
  ok(G.pendingItemSpends.length === L.MAX_ENTRIES, 'ledger is bounded at MAX_ENTRIES');
}
// 8. Garbage in.
{
  ok(L.record(null, {}, {}) === null, 'no G -> null');
  ok(L.record({}, {}, {}) === null, 'empty trade -> null');
  const G = { inventory: {} };
  L.record(G, { 'BAD ID': 5, dungeon_scrip: -3 }, { bone_key: 1.7 }, 'qm');
  ok(JSON.stringify(G.pendingItemSpends[0].debit) === '{}', 'malformed debit legs dropped');
  ok(G.pendingItemSpends[0].credit.bone_key === 1, 'fractional credit floored');
}
console.log(fails ? '\n' + fails + ' FAILURES' : '\nall green');
process.exit(fails ? 1 : 0);
