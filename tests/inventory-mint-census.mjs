// ════════════════════════════════════════════════════════════════════════
// tests/inventory-mint-census.mjs — THE UN-BACKED / UN-PERSISTED MINT TRIPWIRE.
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
// ── THE SECOND, BROADER CLASS THIS GUARD MISSED (2026-09-02, live P1) ────────
// Reported: Dungeon Scrip goes to 0 after doing dungeons; BoP dungeon keys
// (bone_key/goblin_seal) and combat-dropped keys vanish; a built room disappears
// — the "gained, then gone on reload" family. Root cause is NOT the absolute
// flip's DELETE branch — scrip/keys are non-ownable, which that branch KEEPS.
// It is src/net/capstone.js BLOB_RETIRED, which is LIVE: under it the client
// loads the save blob NO MORE, so G.inventory is rebuilt ONLY from the server
// envelope on every reload. An item the server never settles was carried across
// reloads by the blob before; with the blob retired it is simply GONE. So the
// safety criterion changed under everyone's feet:
//
//   PRE-blob-retire:  a client mint is safe if it is not OWNABLE (the flip's
//                     DELETE only touches ownable ids; the blob persists the rest).
//   POST-blob-retire: a client mint is safe ONLY if the SERVER settles the id.
//                     Ownable-or-not, an id the server does not write is lost on
//                     the next reload — the reported class, at economy scale.
//
// This guard modelled only the first criterion, and its FILES list never even
// included src/dungeons.js — so the entire dungeon reward economy (scrip, key
// drops, run loot, Quartermaster) minted client-side, unseen, for months. Both
// holes are closed below: dungeons.js + dungeon-scavenger.js are now scanned,
// AND every dungeon-reward mint token must be declared in BLOB_RETIRE_UNSAFE_LANES
// (a mint the server does not settle, owed a server intent) OR proven server-
// settled — a NEW un-declared dungeon mint fails the build.
//
// It does FOUR things:
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
//   (4) BLOB-RETIRE PERSISTENCE — with BLOB_RETIRED live, assert every mint token
//       in the dungeon-reward files is DECLARED blob-retire-unsafe (owed a server
//       intent) or proven server-settled, so a client mint the server does not
//       persist cannot be added to that economy unseen (the reported class).
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
  // ── 2026-09-02: THE DUNGEON REWARD ECONOMY, previously unscanned. This
  //    omission is the whole reason scrip/keys minted client-side, unseen, and
  //    vanished on reload once BLOB_RETIRED went live. Both files mint via
  //    addItem AND the direct G.inventory[x] += idiom; every token they surface
  //    must land in the census baseline AND in BLOB_RETIRE_UNSAFE_LANES below. ──
  'src/dungeons.js',
  'src/dungeon-scavenger.js',
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
  // safe under the flip's DELETE, but see the blob-retire note in
  // BLOB_RETIRE_UNSAFE_LANES: an un-settled proc bonus is a bounded reload-loss),
  // and refundIngredients restores cook inputs (inv:k — excluded, same).
  'src/features/companions.js': ['inv:ctx.cropId', 'inv:ctx.lastDrop.id', 'inv:k'],
  // ── THE DUNGEON REWARD ECONOMY (blob-retire-unsafe; see BLOB_RETIRE_UNSAFE_LANES).
  //    'dungeon_scrip' = awardDungeonScrip; roll.id/inv:roll.id = awardLoot (run
  //    loot); id/inv:id = buyFromQuartermaster (keys/blueprints/weapons for scrip).
  //    ── increment 1 (docs/design/dungeon-settlement.md §3): the BoP key-drop
  //    mint (formerly entry.keyId / inv:entry.keyId, the killMonster wrapper) is
  //    GONE — folded into MONSTERS[*].drops (src/data/monsters.js), so keys now
  //    settle server-side through the accrual engine like every combat drop.
  //    Its tokens are removed from this baseline AND from BLOB_RETIRE_UNSAFE_LANES;
  //    the fold is guarded by tests/dungeon-key-drops.mjs.
  'src/dungeons.js': ["'dungeon_scrip'", 'id', 'inv:id', 'inv:roll.id', 'roll.id'],
  //    a.id/inv:a.id = the scavenger's per-node loot grant (scrip rides
  //    awardDungeonScrip, a function call the mint regex does not match — it is
  //    covered by the dungeons.js 'dungeon_scrip' lane, one implementation).
  'src/dungeon-scavenger.js': ['a.id', 'inv:a.id'],
};

// ── THE BLOB-RETIRE-UNSAFE REGISTRY (2026-09-02) ────────────────────────────
// Under src/net/capstone.js BLOB_RETIRED (LIVE) the client rebuilds G.inventory
// ONLY from the server envelope on reload — so a client mint the server does not
// settle is LOST on the next reload, ownable or not (the reported scrip/keys
// class). This is the EXPLICIT registry of such lanes: every mint token in the
// dungeon-reward files must appear here (declared unsafe, owed a server intent)
// OR be proven server-settled, or the build fails. It is the persistence analogue
// of item-authority.js's unbackedOwnableMintLanes(): a name here is a documented
// debt with a named fix, not an accident. When the owed intent ships, drop the
// lane's tokens here AND (per that lane) either remove the client mint or gate it,
// so the guard then demands the ids be server-settled.
//
// Keyed by file → { tokens, mints, owedIntent }. `tokens` is the exact set the
// mint regex surfaces for that lane (kept in lockstep with BASELINE above).
//
// ⚠ SCOPE, STATED HONESTLY. The (4) ENFORCEMENT below ("every mint token must be
//   declared here or proven server-settled") runs only over DUNGEON_FILES — the
//   reported class, fully audited. It is NOT yet run over src/legacy.js, whose
//   ~12 mint tokens are mostly the accrual-settled CORE LOOP (combat/gather/craft)
//   but include at least ONE confirmed sibling of this class: the quest reward
//   ITEM at src/legacy.js `addItem(r.item, …)` (~line 6021), which the code's own
//   comment calls a "later arming slice" — client-applied, no server settlement,
//   so lost on reload under BLOB_RETIRED exactly like scrip/keys. Widening (4) to
//   legacy.js requires classifying every one of its tokens (a real audit, its own
//   commit); until then that lane is an OWED follow-up, named here so it is not
//   re-discovered from a player report. Its fix is the quest-reward arming slice
//   (hr_goal_claim granting the item server-side, mirroring the gold half already
//   done by HearthriseGoalClaim.claimQuest).
const BLOB_RETIRE_UNSAFE_LANES = {
  'src/dungeons.js': [
    { tokens: ["'dungeon_scrip'"], mints: 'Dungeon Scrip (awardDungeonScrip)',
      owedIntent: 'hr_dungeon_settle — server computes + credits scrip into player_inventory on a clear intent (shop_buy/clan_deposit pattern; scrip catalogue in src/data)' },
    // ── increment 1 SHIPPED: the BoP dungeon-key lane is CLOSED. Keys were folded
    //    into MONSTERS[*].drops (src/data/monsters.js §3 of the settlement design),
    //    so they settle server-side via the accrual engine → hr_apply →
    //    player_inventory on both live and away kills, and item-authority.js now
    //    classifies them serverOwnedItem. The client killMonster wrapper is deleted,
    //    so entry.keyId / inv:entry.keyId are no longer minted here. The completeness
    //    of the fold is asserted by tests/dungeon-key-drops.mjs. (Removing the lane
    //    is required: a STALE entry — declared unsafe but no longer minted — fails
    //    this guard by design.)
    { tokens: ['roll.id', 'inv:roll.id'], mints: 'dungeon run loot (awardLoot)',
      owedIntent: 'hr_dungeon_settle — server rolls the loot table (server RNG, server catalogue) and credits into player_inventory' },
    { tokens: ['id', 'inv:id'], mints: 'Quartermaster purchases — keys/blueprints/weapons bought with scrip (buyFromQuartermaster)',
      owedIntent: 'quartermaster_buy intent — the offer catalogue is QM_STOCK (move to src/data), price + item both server-owned; the item-ledger (pendingItemSpends) drains itself the day it ships (src/net/item-ledger.js §end-state)' },
  ],
  'src/dungeon-scavenger.js': [
    { tokens: ['a.id', 'inv:a.id'], mints: 'scavenger per-node loot grants',
      owedIntent: 'same hr_dungeon_settle path as the run loot lane above (scavenger is a dungeon completion path)' },
  ],
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

  // (4) BLOB-RETIRE PERSISTENCE — the class the reported scrip/keys loss belongs to.
  //     With src/net/capstone.js BLOB_RETIRED live, G.inventory reloads ONLY from
  //     the server, so a client mint the server does not settle is lost on reload.
  //     Every mint token in a dungeon-reward file must be DECLARED in
  //     BLOB_RETIRE_UNSAFE_LANES (owed a server intent) or the build fails — so a
  //     NEW dungeon mint cannot be added to that economy without either wiring the
  //     server settlement or consciously registering the debt. This is the
  //     mechanical net that the missing FILES entry (dungeons.js) denied for months.
  let blobRetired = null;
  try {
    const capSrc = await readFile(join(ROOT, 'src', 'net', 'capstone.js'), 'utf8');
    const m = /export\s+const\s+BLOB_RETIRED\s*=\s*(true|false)\b/.exec(capSrc);
    if (!m) {
      // Fail-closed: the whole (4) framing turns on this flag, so a guard that can
      // no longer find it must not quietly pass (the b466 "guard can't see its own
      // input" lesson). Either the const was renamed (update this regex) or moved.
      fail('could not locate `export const BLOB_RETIRED = <bool>` in src/net/capstone.js — the '
        + 'blob-retire persistence framing has lost its anchor. Update this regex or the guard is blind.');
    }
    blobRetired = m ? (m[1] === 'true') : null;
  } catch (e) {
    fail('could not read BLOB_RETIRED out of src/net/capstone.js — the blob-retire persistence '
      + 'check (the reported scrip/keys class) did NOT run: ' + (e && e.message));
  }
  if (blobRetired === false) {
    // Not a failure — but say it loudly, because the whole (4) concern is latent
    // while the blob still persists client mints across reloads. If someone flips
    // it back off, this note explains why the dungeon lanes stop being urgent.
    console.log('inventory-mint-census: NOTE — BLOB_RETIRED is false, so the blob still carries '
      + 'client mints across reloads and the dungeon-reward lanes are not currently reload-losing. '
      + 'The registry stays enforced regardless (the flag is armed in prod and this is a live guard).');
  }
  const DUNGEON_FILES = ['src/dungeons.js', 'src/dungeon-scavenger.js'];
  for (const rel of DUNGEON_FILES) {
    if (!observed[rel]) {
      // NOT a skip. `observed[rel]` is populated only when `rel` is in FILES and
      // readable — so an absent entry means this dungeon file dropped out of the
      // scanned set, which is the ORIGINAL hole (dungeons.js was never in FILES).
      // Fail loudly rather than let the persistence check quietly cover nothing.
      fail(`${rel} is a dungeon-reward mint file this guard must watch, but it is not being scanned `
        + `(missing from FILES, or unreadable). That is exactly the coverage hole that hid the scrip/keys `
        + `mints for months — restore it to FILES.`);
      continue;
    }
    const lanesForFile = BLOB_RETIRE_UNSAFE_LANES[rel] || [];
    const declared = new Set();
    for (const lane of lanesForFile) for (const t of (lane.tokens || [])) declared.add(t);
    // Every OBSERVED dungeon mint token must be declared unsafe (or, in future,
    // proven server-settled). A resolvable literal id that IS server-settled is
    // allowed to skip the registry — but the dungeon lanes mint non-ownable ids
    // (scrip/keys/boss-signatures are unclassified or EXCLUDED), so today every
    // token must be declared. An UNDECLARED one is the exact hole that shipped.
    for (const t of observed[rel]) {
      if (declared.has(t)) continue;
      const litId = /^'([a-z0-9_]+)'$/.exec(t);   // a literal like 'dungeon_scrip'
      const asId = litId ? litId[1] : null;       // a dynamic token cannot be proven settled
      if (asId && IA.serverOwnedItem(asId)) continue;   // genuinely server-settled → safe
      fail(`UN-DECLARED dungeon-reward mint in ${rel}: addItem(${t}, …). Under BLOB_RETIRED the server `
        + `rebuilds G.inventory on reload, so a client mint the server does not settle is LOST (the reported `
        + `Dungeon Scrip / dungeon-key class). Declare it in BLOB_RETIRE_UNSAFE_LANES with the server intent `
        + `it is owed, or — once that intent ships — remove/gate the client mint and prove the id is `
        + `server-settled (item-authority.js serverOwnedItem).`);
    }
    // No STALE registry entries: a token declared unsafe but no longer minted is a
    // lie the next reader trusts. (Mirrors the census "removed" check, for the registry.)
    for (const t of declared) {
      if (!observed[rel].includes(t)) {
        fail(`STALE BLOB_RETIRE_UNSAFE_LANES entry for ${rel}: token ${t} is declared unsafe but no `
          + `longer appears as a mint. If the lane was server-settled, remove the entry (and confirm the `
          + `mint is gone/gated); if the token merely moved, update it.`);
      }
    }
  }
  // The registry must actually cover the dungeon files — an empty registry with a
  // populated census is the coverage hole reopening under a different name.
  const totalDeclared = Object.values(BLOB_RETIRE_UNSAFE_LANES)
    .reduce((n, lanesArr) => n + lanesArr.reduce((k, l) => k + (l.tokens || []).length, 0), 0);
  if (totalDeclared === 0) {
    fail('BLOB_RETIRE_UNSAFE_LANES is EMPTY. The dungeon reward economy mints client-side with no server '
      + 'settlement and is lost on reload under BLOB_RETIRED; an empty registry means that debt is unseen again.');
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
