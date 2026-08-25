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
// ── b466 — THE CENSUS IS NOW *DERIVED*, NOT HAND-TYPED ──────────────────────
// The hand-maintained list below was the guard's own strand: it could only
// catch a field somebody REMEMBERED to add to it, and nobody ever did. The live
// proof is paione's bug report — "Bestiary achievements keep resetting every
// time you log out and in" — `G.bestiary` had been written by the game since
// b288 and was on no homing list AND on no census list, so the guard passed
// green while 22 fields silently reset on every reload.
//
// So the census is now SCANNED OUT OF THE SOURCE: every top-level `G.<field> =`
// (also `||=`, `+=`, `-=`) under `src/`, minus `_`-prefixed scratch. The
// hand-list is KEPT and unioned in — it names fields the contract cares about
// even if the write happens through a helper — but it is no longer the only
// input, so a future `G.newThing = …` with no home fails the build on the day
// it is written rather than on the day a player loses it.
//
// Run standalone:  node tests/arm-homing-guard.mjs
// Wired into the suite as a preflight (armHomingGuard).
// ════════════════════════════════════════════════════════════════════════
import { readFile, readdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

/* THE HARNESS IS NOT THE GAME. src/features/smoke-test.js writes hundreds of
   `G.<field> =` SEEDS (and restores them straight after); those are fixtures,
   not game state, and one of them (`G.seasonPass`, retired in b215 and read by
   nothing) exists only to prove a retired field grants nothing. Scanning it
   would make the guard fail on test scaffolding. Every field the GAME persists
   is written by the GAME, so excluding the harness costs no coverage. */
const CENSUS_SKIP = new Set(['src/features/smoke-test.js']);

/** Every top-level `G.<field>` assignment site under src/, as a Set of names. */
async function scanGFieldWrites() {
  const found = new Set();
  const files = [];
  async function walk(rel) {
    const entries = await readdir(new URL(rel, ROOT), { withFileTypes: true });
    for (const e of entries) {
      const child = rel + e.name + (e.isDirectory() ? '/' : '');
      if (e.isDirectory()) await walk(child);
      else if (e.name.endsWith('.js') && !CENSUS_SKIP.has(child)) files.push(child);
    }
  }
  await walk('src/');
  //  G.foo = (not ==/===)   |   G.foo ||=   |   G.foo +=   |   G.foo -=
  const re = /\bG\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\|=|\+=|-=|=[^=])/g;
  for (const f of files) {
    const src = await readFile(new URL(f, ROOT), 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      if (name.charAt(0) === '_') continue;          // `_`-prefixed scratch is never persisted
      found.add(name);
    }
  }
  return found;
}

export async function armHomingGuard() {
  const problems = [];
  const fail = (m) => problems.push('arm-homing: ' + m);

  // ── The HAND CENSUS (kept, unioned with the scan): every top-level key
  //    snapshot() uploads (the documented contract in events.js
  //    snapshotLegacyFields) PLUS the residue-census tail the b439 audit
  //    surfaced. A field here that the scanner cannot see (written through a
  //    helper, or by the server envelope only) is still asserted.
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

  // ── The homing mechanisms, read from source so they cannot drift. ──
  let recordFields, residueFields, noSyncFields, censusFromSource;
  try {
    const recSrc = await readFile(new URL('src/net/record.js', ROOT), 'utf8');
    // every `field: 'X'` on a SERVER_OF_RECORD entry
    recordFields = new Set([...recSrc.matchAll(/field:\s*'([a-zA-Z_]+)'/g)].map((m) => m[1]));
    const csMod = await import(mod('src/net/client-state.js'));
    residueFields = new Set(csMod.RESIDUE_FIELDS);
    /* NO_SYNC is read from events.js SOURCE (not imported): events.js is a
       browser module with side effects, and the guard must stay a pure static
       check. The block is a single `const NO_SYNC = new Set([ … ]);`. */
    const evSrc = await readFile(new URL('src/net/events.js', ROOT), 'utf8');
    const block = /const\s+NO_SYNC\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/.exec(evSrc);
    if (!block) throw new Error('could not find the NO_SYNC block in src/net/events.js');
    noSyncFields = new Set([...block[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1]));
    censusFromSource = await scanGFieldWrites();
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
    /* b466: traits — accrue.js reconcileTraits UNIONS the envelope's `traits`
       array (hr_state_of projects the player_progress `trait:<id>` rows
       hr_trait_buy writes) into G.traits on every load. A paid entitlement with
       a server row must be homed HERE, not duplicated into the residue bag. */
    'traits',
  ]);
  /* Derived / never-uploaded — homed by definition (recomputed at runtime, or
     re-supplied by the envelope on every load). EXPLICIT: a name here is a
     deliberate claim that losing it across a reload is CORRECT and invisible.
     Anything you are not sure about belongs in RESIDUE_FIELDS instead — save
     invariant 3's safe direction is PERSIST. */
  const RUNTIME_DERIVED = new Set([
    'totalLevel', 'combatLevel',        // recomputed from skills every render
    'account', 'cloudSyncedAt', 'v',    // save-envelope bookkeeping, re-stamped on load
    'clanName', 'clanId',               // re-supplied by the clan fetch on every boot
  ]);

  // ── THE ASSERTION: every census field is on exactly one homing list. ──
  // The census is the SOURCE SCAN ∪ the hand list (see the header) — so a field
  // the game writes cannot escape by never having been added to a list.
  const CENSUS = new Set([...SNAPSHOT_FIELDS, ...censusFromSource]);
  for (const f of CENSUS) {
    const onRecord = recordFields.has(f);
    const onResidue = residueFields.has(f);
    const onMechanism = SERVER_MECHANISM_FIELDS.has(f);
    const onNoSync = noSyncFields.has(f);
    const derived = RUNTIME_DERIVED.has(f);
    const homes = [onRecord && 'record', onResidue && 'residue', onMechanism && 'mechanism',
      onNoSync && 'no-sync', derived && 'derived'].filter(Boolean);
    if (homes.length === 0) {
      fail(`'${f}' is written by the game but is homed by NOTHING (not SERVER_OF_RECORD, not RESIDUE_FIELDS, not a `
         + `SERVER_MECHANISM reconcile, not NO_SYNC scratch, not runtime-derived). Under BLOB_RETIRED it will read `
         + `undefined on every reload → crash or silent data reset (paione, b466: "Bestiary achievements keep `
         + `resetting every time you log out and in"). Home it: add a record entry + reader (rooms/equipment `
         + `pattern), a reconcile<X> on the load path (companions/farm pattern), add it to RESIDUE_FIELDS `
         + `(self-only progress — the SAFE default), or declare it in-flight scratch by adding it to NO_SYNC in `
         + `src/net/events.js. When in doubt: PERSIST.`);
    }
    /* Scratch and persistence are mutually exclusive claims. NO_SYNC says "this
       is in-flight, losing it is correct"; residue/record say "this survives a
       reload". Both = the field is being described two ways and one of the two
       readers is wrong. */
    if (onNoSync && (onResidue || onRecord || onMechanism)) {
      fail(`'${f}' is in NO_SYNC (declared in-flight scratch) AND on a persistence home `
         + `(${[onRecord && 'record', onResidue && 'residue', onMechanism && 'mechanism'].filter(Boolean).join('+')}). `
         + `Pick one: persistent progress must NEVER be in NO_SYNC (save invariant 3 — silent cloud data loss).`);
    }
    // A field on BOTH the authority record AND residue is the two-sources bug
    // (marks lived nested in bountyHunter until b443) — flag it.
    if (onRecord && onResidue) {
      fail(`'${f}' is on BOTH SERVER_OF_RECORD and RESIDUE_FIELDS — the two-sources bug. An authority field must not `
         + `also be a self-only residue key. Remove it from one (authority wins).`);
    }
  }

  /* ── THE SERVER HALF: no residue field may be on hr_put_client_state's
     AUTHORITY DENY-LIST. The server refuses the WHOLE patch (not just the key)
     with {error:'forbidden_field'} — so one bad name would silently stop EVERY
     residue field from being saved, for everyone. Read out of the migration
     source so the two lists cannot drift apart. */
  try {
    const sql = await readFile(new URL('supabase/migrations/2026-08-22-client-state-denylist.sql', ROOT), 'utf8');
    const arr = /v_deny\s+constant\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(sql);
    if (!arr) {
      fail('could not read the hr_put_client_state deny-list out of 2026-08-22-client-state-denylist.sql — '
         + 'the residue/authority collision check did NOT run.');
    } else {
      const deny = new Set([...arr[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1]));
      for (const f of residueFields) {
        if (deny.has(f)) {
          fail(`residue field '${f}' is on the hr_put_client_state AUTHORITY deny-list. The server refuses the `
             + `ENTIRE patch on a forbidden key, so shipping this would stop every residue field from saving for `
             + `every player. It is an authority field — home it in SERVER_OF_RECORD, not RESIDUE_FIELDS.`);
        }
      }
    }
  } catch (e) {
    fail('the residue/deny-list collision check threw: ' + (e && e.message));
  }

  // ── THE LOAD-PATH CALL WIRING (b477). ──────────────────────────────────────
  // Listing a field as a SERVER_MECHANISM above only claims a reconcile<X> EXISTS
  // — it does NOT prove settle() (the idle-boot / hr_load handler in record.js)
  // actually CALLS it. That gap shipped the "invisible crew" bug: reconcileWorkers
  // existed and was unit-tested, but settle() never invoked it, so on an IDLE boot
  // (hr-accrue → accrued:false, applyEnvelopeState never runs) the roster was never
  // hydrated and a player with a producing crew saw G.workers.hired=[] (QA
  // 0a47ba77, live). Every reconcile that hydrates a SERVER_MECHANISM field on the
  // load path MUST be called in record.js, or an idle boot silently drops it.
  try {
    const recSrc = await readFile(new URL('src/net/record.js', ROOT), 'utf8');
    const MUST_CALL = ['reconcileInventory', 'reconcileBank', 'reconcileWorkers',
      'reconcileCompanions', 'reconcileFarm', 'reconcileTraits'];
    for (const fn of MUST_CALL) {
      // a CALL, not merely the import — `fn(` with G as the first arg on the load path.
      const called = new RegExp(fn + '\\s*\\(\\s*G\\b').test(recSrc);
      if (!called) {
        fail(`'${fn}' is a SERVER_MECHANISM reconcile but record.js's load path never CALLS it (no `
           + `\`${fn}(G…\`). Listing the field as a mechanism is not enough — an IDLE boot answers `
           + `accrued:false so applyEnvelopeState never runs; the reconcile MUST be invoked in settle() from `
           + `the hr_load envelope or the field silently resets on reload (b477 invisible-crew class).`);
      }
    }
  } catch (e) {
    fail('the load-path call-wiring check threw: ' + (e && e.message));
  }

  // Bank purchase counters (goldBuys/gemBuys/grandfather) ride inside G.bank —
  // covered by the bank mechanism; no separate assertion. bountyHunter.marks was
  // the historic nested-authority trap — now top-level G.marks (b443), asserted above.

  if (!problems.length) {
    // A positive line so a green run proves the guard actually walked the census.
    console.log(`Arm-homing guard — all ${CENSUS.size} G fields homed `
      + `(${censusFromSource.size} scanned from src/, ${recordFields.size} record, ${residueFields.size} residue, `
      + `${SERVER_MECHANISM_FIELDS.size} mechanism, ${noSyncFields.size} no-sync).`);
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
