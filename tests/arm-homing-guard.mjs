// ════════════════════════════════════════════════════════════════════════
// tests/arm-homing-guard.mjs — THE EVERY-FIELD-HOMED GUARD (strand-audit follow-up).
//
// BLOB_RETIRED is the UNION of every arm: under it the client loads NOTHING from
// the save blob, so a field lands in G only if a server mechanism WRITES it on
// load — via applyRecord (SERVER_OF_RECORD, when armed), applyEnvelopeState /
// a reconcile* (a SERVER_MECHANISM field), or hydrateInto (RESIDUE_FIELDS). Any
// blob field that is none of those is STRANDED under arm → reads undefined →
// a boot/combat crash or a silent data reset (rooms Object.values threw before
// b442; companions reset the roster before b447; farm lost crops before b448).
//
// This guard is the MECHANICAL net the strand audit asked for: it fails the
// build the instant a persisted field is added that no mechanism homes, so a
// future "just add G.newThing" cannot silently become a strand nobody noticed
// until the arm. It is a pure static check — no DB, no browser.
//
// Run standalone:  node tests/arm-homing-guard.mjs
// Wired into the suite as a preflight (armHomingGuard).
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function armHomingGuard() {
  const problems = [];
  const fail = (m) => problems.push('arm-homing: ' + m);

  // ── The FIELD CENSUS: every top-level key snapshot() uploads (the documented
  //    contract in events.js snapshotLegacyFields) PLUS the residue-census tail
  //    the b439 audit surfaced. This is the set that must be fully homed. It is
  //    restated here (not imported) so the guard is a second, independent opinion
  //    — if a field is added to the blob but not here, the events.js/snapshot
  //    census reminder below is what points the next person at this file.
  const SNAPSHOT_FIELDS = [
    // the 18 legacy contract fields
    'skills', 'inventory', 'bank', 'equipment', 'companions', 'farmPlots', 'rooms',
    'bountyHunter', 'gold', 'gems', 'stats', 'playerName', 'activeStyle', 'foodSlot',
    'restedXp', 'restedAt', 'chronicle',
    // the residue-census tail (b439 audit)
    'settings', 'ownedThemes', 'ownedCosmetics', 'houseTheme', 'plotBuildings',
    'daily', 'collection', 'quests', 'entitlements', 'lastSeen', 'autoEatPct', 'createdAt',
    // other persisted top-level state
    'marks', 'gems', 'plotLevels', 'workers', 'enchant',
    'heroSlotsUnlocked',  // b459: the hero-slot entitlement — missed by the original census
  ];

  // ── The THREE homing mechanisms, read from source so they cannot drift. ──
  let recordFields, residueFields;
  try {
    const recSrc = await readFile(new URL('src/net/record.js', ROOT), 'utf8');
    // every `field: 'X'` on a SERVER_OF_RECORD entry
    recordFields = new Set([...recSrc.matchAll(/field:\s*'([a-zA-Z_]+)'/g)].map((m) => m[1]));
    const csMod = await import(mod('src/net/client-state.js'));
    residueFields = new Set(csMod.RESIDUE_FIELDS);
  } catch (e) {
    fail('could not load the homing sets, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  // Fields a server mechanism reconciles in-G on load (NOT the record, NOT
  // residue) — each MUST have a live reconstruction. This allowlist is the
  // explicit "yes, a mechanism owns this" registry; adding a name here is a
  // deliberate claim that reconcile<X> exists and is wired on the load path.
  const SERVER_MECHANISM_FIELDS = new Set([
    'inventory',   // accrue.js applyEnvelopeState merge/absolute
    'bank',        // accrue.js reconcileBank
    'workers',     // accrue.js reconcileWorkers
    'enchant',     // accrue.js (state.enchant)
    'companions',  // accrue.js reconcileCompanions (b447)
    'farmPlots',   // accrue.js reconcileFarm (b448)
    'plotLevels',  // farm tier (reconcileFarm / getPlotLevel fail-safe)
  ]);
  // Derived / never-uploaded — homed by definition (recomputed at runtime).
  const RUNTIME_DERIVED = new Set(['totalLevel', 'combatLevel', 'account', 'cloudSyncedAt', 'v', 'clanName', 'clanId']);

  // ── THE ASSERTION: every census field is on exactly one homing list. ──
  for (const f of new Set(SNAPSHOT_FIELDS)) {
    const onRecord = recordFields.has(f);
    const onResidue = residueFields.has(f);
    const onMechanism = SERVER_MECHANISM_FIELDS.has(f);
    const derived = RUNTIME_DERIVED.has(f);
    const homes = [onRecord && 'record', onResidue && 'residue', onMechanism && 'mechanism', derived && 'derived'].filter(Boolean);
    if (homes.length === 0) {
      fail(`'${f}' is uploaded by snapshot() but is homed by NOTHING (not SERVER_OF_RECORD, not RESIDUE_FIELDS, not a `
         + `SERVER_MECHANISM reconcile, not runtime-derived). Under BLOB_RETIRED it will read undefined → crash or `
         + `data reset. Home it: add a record entry + reader (rooms/equipment pattern), a reconcile<X> on the load `
         + `path (companions/farm pattern), or add it to RESIDUE_FIELDS (self-only) — then register it here.`);
    }
    // A field on BOTH the authority record AND residue is the two-sources bug
    // (marks lived nested in bountyHunter until b443) — flag it.
    if (onRecord && onResidue) {
      fail(`'${f}' is on BOTH SERVER_OF_RECORD and RESIDUE_FIELDS — the two-sources bug. An authority field must not `
         + `also be a self-only residue key. Remove it from one (authority wins).`);
    }
  }

  // Bank purchase counters (goldBuys/gemBuys/grandfather) ride inside G.bank —
  // covered by the bank mechanism; no separate assertion. bountyHunter.marks was
  // the historic nested-authority trap — now top-level G.marks (b443), asserted above.

  if (!problems.length) {
    // A positive line so a green run proves the guard actually walked the census.
    console.log(`Arm-homing guard — all ${new Set(SNAPSHOT_FIELDS).size} persisted fields homed `
      + `(${recordFields.size} record, ${residueFields.size} residue, ${SERVER_MECHANISM_FIELDS.size} mechanism).`);
  }
  return problems;
}

// CLI
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const problems = await armHomingGuard();
  if (problems.length) { for (const p of problems) console.error('  ✗ ' + p); process.exit(1); }
  process.exit(0);
}
