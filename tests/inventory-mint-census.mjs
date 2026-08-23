// ════════════════════════════════════════════════════════════════════════
// tests/inventory-mint-census.mjs — THE UN-BACKED OWNABLE MINT TRIPWIRE.
//
// The inventory absolute-replace flip (INVENTORY_ARM_ENABLED) REPLACES the bag
// with the server's envelope: a named key sets the qty, an OMITTED key is a real
// zero. That is only safe for an item the server actually settles. Every CLIENT
// site that writes G.inventory (window.addItem / addItem / G.inventory[x] +=) for
// an OWNABLE id the server never wrote is a data-loss landmine — the flip deletes
// it. b422 closed the muster ONLINE chest; 2026-08-22 closed the muster ABSENCE
// chest; workers + raid remain registered-and-fail-closed until their server mint
// ships. This guard is the mechanical net the audit asked for: it FAILS THE BUILD
// the instant a NEW inventory-mint site appears that nobody has classified, so a
// future `addItem(gatherProduct)` with no server write cannot silently re-open the
// landmine.
//
// It does three things:
//   (1) CENSUS — enumerate every mint site (per file, by its first-arg token) and
//       compare to the frozen baseline below. A new/removed site fails until a
//       human classifies it (gate it on the inventory seam + register the lane, or
//       confirm it mints only non-ownable ids).
//   (2) GATE REGRESSION — assert the known side-reward OWNABLE mint sites (muster,
//       raid, renown) are inventory-seam gated in source, and the worker mint is
//       flag-gated, so a refactor cannot silently un-gate them.
//   (3) FAIL-CLOSED — import src/data/item-authority.js and assert flipArmBlockers()
//       is NON-EMPTY while any lane's backing flag is false, i.e. the flip
//       physically cannot arm while an un-backed ownable lane exists.
//
// Pure static + a single ESM import. No DB, no browser. Run standalone:
//   node tests/inventory-mint-census.mjs
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// ── The mint files this guard watches. legacy.js is the core-loop authority
//    (combat/gather/craft prediction the accrual engine settles); the feature
//    files are the side-reward surfaces where an un-backed one-shot grant hides. ─
const FILES = [
  'src/legacy.js',
  'src/features/muster.js',
  'src/features/raids.js',
  'src/features/renown.js',
  'src/features/workers.js',
  'src/features/farm-progression.js',
  'src/features/companions.js',
];

// ── THE FROZEN BASELINE: for each file, the SET of distinct first-arg tokens the
//    inventory-mint sites use. Keyed by token (not line) so it is stable across
//    edits; a NEW token (a new mint expression) or a REMOVED one trips the guard.
//    Regenerate deliberately with `node tests/inventory-mint-census.mjs --update`
//    and re-classify every added token before committing the new baseline. ──────
const BASELINE = {
  'src/legacy.js': [
    "'hearth_token'", 'b.id', 'crop.prod', 'cur', 'id', 'kv[0]',
    'r.item', 'r.output', 'res.produced.id', 'rewards.itemId',
    'inv:id', 'inv:old',
  ],
  'src/features/muster.js': ["'muster_seal'", 'it.id'],
  'src/features/raids.js': ['chest.sig', 'id'],
  'src/features/renown.js': ['rw.item'],
  'src/features/workers.js': ['act.prod'],
  'src/features/farm-progression.js': ["'farm_deed'", 'id'],
  // companions.js writes G.inventory directly (no addItem): doubleDrop mints an
  // extra OWNABLE combat/gather drop (inv:ctx.lastDrop.id — the ~2-3% ACCEPTED
  // RESIDUAL the flip drops; bounded, non-forgeable, cannot be excluded without
  // gutting the ownable set), doubleYield mints a crop (inv:ctx.cropId — EXCLUDED,
  // safe), and refundIngredients restores cook inputs (inv:k — excluded, safe).
  'src/features/companions.js': ['inv:ctx.cropId', 'inv:ctx.lastDrop.id', 'inv:k'],
};

// Every mint call: addItem( or window.addItem( or fx.addItem(, capturing the
// first argument token up to the comma/paren.
const MINT_RE = /(?:window\.|fx\.)?addItem\(\s*([^,)]+?)\s*[,)]/g;
// The DIRECT mint idiom: G.inventory[TOKEN] = (G.inventory[TOKEN]||0) + …. This
// is the += form the audit named; it deliberately does NOT match consumption
// (`= x - cost`) or a plain set, only an additive mint. Prefixed `inv:` in the
// census so it never collides with an addItem token of the same name.
const INV_ADD_RE = /G\.inventory\[\s*([^\]]+?)\s*\]\s*=\s*\(?[^;=]*\|\|\s*0\)?\s*\+/g;

function tokensIn(src) {
  const out = new Set();
  let m;
  while ((m = MINT_RE.exec(src)) !== null) {
    const tok = m[1].trim();
    if (tok !== '') out.add(tok);
  }
  while ((m = INV_ADD_RE.exec(src)) !== null) {
    const tok = m[1].trim();
    if (tok !== '') out.add('inv:' + tok);
  }
  return out;
}

export async function inventoryMintCensusGuard(opts) {
  opts = opts || {};
  const problems = [];
  const fail = (m) => problems.push('inv-mint-census: ' + m);

  const observed = {};
  const srcByFile = {};
  for (const rel of FILES) {
    let src;
    try { src = await readFile(join(ROOT, rel), 'utf8'); }
    catch (e) {
      fail(`could not read ${rel} — a mint file this guard exists to watch is unreadable, which is a failure not a skip: ${e && e.message}`);
      continue;
    }
    srcByFile[rel] = src;
    observed[rel] = [...tokensIn(src)].sort();
  }

  if (opts.update) {
    // Emit a fresh baseline for the maintainer to paste in after re-classifying.
    console.log('inventory-mint-census baseline (re-classify every NEW token before committing):');
    console.log(JSON.stringify(observed, null, 2));
    return problems;
  }

  // (1) CENSUS diff.
  for (const rel of FILES) {
    if (!observed[rel]) continue;
    const want = new Set(BASELINE[rel] || []);
    const have = new Set(observed[rel]);
    const added = [...have].filter((t) => !want.has(t));
    const removed = [...want].filter((t) => !have.has(t));
    for (const t of added) {
      fail(`NEW inventory-mint site in ${rel}: addItem(${t}, …). Classify it: if ${t} can be an OWNABLE `
        + `id (src/data/item-authority.js classifyItem), GATE it on clientMayWriteRecordField('inventory') `
        + `AND register the lane in unbackedOwnableMintLanes() behind a server-backed flag; if it only ever `
        + `mints non-ownable ids, add it to the baseline. Do NOT add it un-reviewed.`);
    }
    for (const t of removed) {
      fail(`inventory-mint site GONE from ${rel}: addItem(${t}, …) was in the baseline but is no longer present. `
        + `If deliberate, remove it from BASELINE; if accidental, restore the mint.`);
    }
  }

  // (2) GATE REGRESSION — the known side-reward OWNABLE mint sites must stay gated.
  const seam = "clientMayWriteRecordField('inventory')";
  const gateChecks = [
    ['src/features/muster.js', 'muster chest (online + absence)'],
    ['src/features/raids.js', 'raid chest mats + signature'],
    ['src/features/renown.js', 'renown rank item reward'],
  ];
  for (const [rel, what] of gateChecks) {
    const src = srcByFile[rel];
    if (src && !src.includes(seam)) {
      fail(`${rel} (${what}) no longer references ${seam} — the inventory-seam gate on its addItem was removed, `
        + `re-opening an un-backed ownable mint under the flip.`);
    }
  }
  // Worker mint is flag-gated, not seam-gated: assert the flag guard survives.
  const wsrc = srcByFile['src/features/workers.js'];
  if (wsrc && !/WORKER_PRODUCTION_SERVER_BACKED/.test(wsrc)) {
    fail('src/features/workers.js no longer references WORKER_PRODUCTION_SERVER_BACKED — the worker mint '
      + 'is no longer flag-gated and could mint gather products the flip would delete.');
  }

  // (3) FAIL-CLOSED — the arm-gate must refuse while an un-backed ownable lane exists.
  let IA;
  try {
    IA = await import(pathToFileURL(join(ROOT, 'src', 'data', 'item-authority.js')).href);
  } catch (e) {
    fail('could not import src/data/item-authority.js — the arm-gate registry is the thing this guard '
      + 'verifies, so an unimportable one is a failure: ' + (e && e.message));
    return problems;
  }
  const lanes = IA.unbackedOwnableMintLanes();
  const blockers = IA.flipArmBlockers();
  // While RAID_ITEMS_SERVER_BACKED is false there MUST be a raid blocker, else the
  // flip could arm and delete the client-minted raid chest.
  if (IA.RAID_ITEMS_SERVER_BACKED === false) {
    const hasRaid = lanes.some((l) => /raids\.js/.test(l.source));
    if (!hasRaid) fail('RAID_ITEMS_SERVER_BACKED is false but unbackedOwnableMintLanes() has no raids.js lane — the fail-closed registry is not registering it.');
    if (blockers.length === 0) fail('RAID_ITEMS_SERVER_BACKED is false but flipArmBlockers() is EMPTY — the arm-gate would let the flip arm with an un-backed raid mint (data loss).');
  }
  if (IA.WORKER_PRODUCTION_SERVER_BACKED === false) {
    const hasWorker = lanes.some((l) => /workers\.js/.test(l.source));
    if (!hasWorker) fail('WORKER_PRODUCTION_SERVER_BACKED is false but no workers.js lane is registered.');
  }
  // If every lane flag is true (fully backed), flipArmBlockers may be empty — that
  // is the ONLY state in which the flip is allowed to arm. Assert the biconditional.
  if (lanes.length === 0 && blockers.length !== 0) {
    fail('no un-backed lanes remain yet flipArmBlockers() is non-empty — the gate is stuck closed.');
  }
  if (lanes.some((l) => l.assumeOwnable || [...l.ids].some((id) => IA.serverOwnedItem(id))) && blockers.length === 0) {
    fail('an un-backed lane grants an ownable id but flipArmBlockers() is empty — fail-closed is broken.');
  }

  return problems;
}

// Standalone runner.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const update = process.argv.includes('--update');
  inventoryMintCensusGuard({ update }).then((problems) => {
    if (update) return;
    if (problems.length) {
      console.log('Inventory-mint census — FAILED:');
      for (const p of problems) console.log('  x ' + p);
      process.exit(1);
    }
    console.log('Inventory-mint census — OK: every mint site classified; arm-gate fail-closed while un-backed lanes exist.');
  });
}
