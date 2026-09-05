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

/* ── THE Object.assign(G, <expr>) ALLOWLIST — known blob-splat LOAD/MIGRATION
   paths (b486). A plain `G.field =` regex is BLIND to a whole-object splat like
   `Object.assign(G, blob)` and to alias writes (`const g = G; g.x = …`) — a field
   introduced only that way passes the census green then STRANDS under arm exactly
   like `bestiary` did. So the scanner now reads those too. These opaque
   `Object.assign(G, expr)` sites splat a whole SAVE object into G on the DORMANT
   (blob) load path and are INERT under BLOB_RETIRED (the blob is never loaded when
   armed) — which is precisely WHY every field they carry must have an independent
   home. They are opaque to a static scan, so they are allowlisted by their exact
   argument expression; ANY OTHER opaque Object.assign(G, x) fails the guard (it
   could splat an un-homed field past the field regex). Allowed args:
     · `stripRecordFields(migrated)` — legacy.js loadLocal (v1 + slot migration)
     · `overlay`                     — auth.js applyCloudOverlay (cloud restore) */
const OBJECT_ASSIGN_ALLOW = new Set(['stripRecordFields(migrated)', 'overlay']);

/* ── THE `X = G;` ALIAS-ROOT ALLOWLIST ───────────────────────────────────────
   An alias write (`const g = G; g.x = …`) is the OTHER blind spot: the field
   scanner sees `g.x =`, not `G.x =`. Attributing a bare alias var's property
   writes to G is unsafe here because names are REUSED (`cur` is both the
   read-only path-walker `var cur = G;` AND `const cur = G.loadouts[idx]` a dozen
   functions away). So the guard flags the alias ROOT instead — any `NAME = G;`
   that is not a known read-only idiom fails, forcing a reviewer to confirm the
   alias's field writes are homed (or to allowlist it). `cur` is the read-only
   path-walker idiom (immediately reassigned via `cur = cur[parts[i]]`, never a
   stable G alias) — if you add a WRITING alias, name it something else. */
const ALIAS_ROOT_ALLOW = new Set(['cur']);

/** Blank the interiors of comments and string/template literals so the field
 *  scanner never matches code-shaped text that is really prose or a docstring
 *  (record.js documents `Object.assign(G, blob)` in a comment; gold-sites.js
 *  quotes it in a string). Newlines are preserved. Not a full JS parser — regex
 *  literals are left as-is, which is safe because none contain `Object.assign(G,`
 *  or `= G;`. */
function stripCode(src) {
  let out = ''; let i = 0; const n = src.length; let mode = null;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (mode === null) {
      if (c === '/' && d === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { mode = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = null; out += c; } else out += ' '; i++; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = null; out += '  '; i += 2; } else { out += (c === '\n' ? '\n' : ' '); i++; } continue; }
    // string/template: blank the interior, keep escapes + the closing delimiter.
    if (c === '\\') { out += '  '; i += 2; continue; }
    if (c === mode) { mode = null; out += c; i++; continue; }
    out += (c === '\n' ? '\n' : ' '); i++;
  }
  return out;
}

/** Pull every field a source string writes into G — direct `G.f =` and
 *  `Object.assign(G, {literal})` keys — plus structural `problems`: an opaque
 *  un-allowlisted `Object.assign(G, expr)` or a non-idiom `X = G;` alias root,
 *  each of which could smuggle an un-homed field past the field scanner.
 *  Exported so the self-check below can prove the scanner still SEES these. */
export function extractGWrites(rawSrc) {
  const src = stripCode(rawSrc);
  const fields = new Set();
  const problems = [];
  const add = (name) => { if (name && name.charAt(0) !== '_') fields.add(name); };

  // 1 — direct  G.foo = (not ==/===) | ||= | += | -=
  let m;
  const re = /\bG\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\|=|\+=|-=|=[^=])/g;
  while ((m = re.exec(src))) add(m[1]);

  // 2 — Object.assign(G, …): literal keys become census fields; an opaque arg
  //     must be on the allowlist or it is a smuggling site.
  const marker = /Object\.assign\(\s*G\s*,\s*/g;
  while ((m = marker.exec(src))) {
    const i = m.index + m[0].length;
    if (src.charAt(i) === '{') {
      let depth = 0, j = i;
      for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { j++; break; } } }
      const body = src.slice(i, j);
      const keyRe = /(?:^|[,{])\s*(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))\s*:/g;
      let k; while ((k = keyRe.exec(body))) add(k[1] || k[2] || k[3]);
    } else {
      // opaque expression — paren-match the whole call, isolate the 2nd arg.
      const open = src.indexOf('(', m.index);
      let depth = 0, j = open;
      for (; j < src.length; j++) { const c = src[j]; if (c === '(') depth++; else if (c === ')') { depth--; if (depth === 0) { j++; break; } } }
      const arg = src.slice(i, j - 1).trim().replace(/\s+/g, ' ');
      if (!OBJECT_ASSIGN_ALLOW.has(arg)) problems.push('Object.assign(G, ' + arg + ')');
    }
  }

  // 3 — alias roots:  `X = G;`  (the alias-write blind spot). Flag non-idiom roots.
  const aliasRe = /\b([A-Za-z_$][\w$]*)\s*=\s*G\s*;/g;
  while ((m = aliasRe.exec(src))) {
    const name = m[1];
    if (name === 'G' || ALIAS_ROOT_ALLOW.has(name)) continue;
    problems.push(name + ' = G;  (alias root)');
  }

  return { fields, problems };
}

/** Every field the game writes into G under src/, plus any smuggling sites found. */
async function scanGFieldWrites() {
  const found = new Set();
  const smuggles = [];
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
  for (const f of files) {
    const src = await readFile(new URL(f, ROOT), 'utf8');
    const { fields, problems } = extractGWrites(src);
    for (const name of fields) found.add(name);
    for (const p of problems) smuggles.push({ file: f, call: p });
  }
  return { found, smuggles };
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

  // ── SELF-CHECK: prove the scanner SEES Object.assign / alias writes (the b486
  //    blind spot). A regression here would silently re-open the smuggling gap,
  //    so it FAILS the guard rather than merely warning. Underscore-prefixed
  //    names are intentionally skipped, so the positive probes are non-underscore. ──
  {
    const probe = extractGWrites(
      'Object.assign(G, { probeAssignField: 1, probeSecond: 2 });\n'
      + 'const probeAlias = G;\n probeAlias.probeAliasField = 3;\n'
      + 'Object.assign(G, someOpaqueSplat(x));\n'
      + '// a comment mentioning Object.assign(G, blobInComment) must NOT flag\n'
      + 'const s = "a string with = G; and Object.assign(G, x) inside";');
    if (!probe.fields.has('probeAssignField') || !probe.fields.has('probeSecond')) {
      fail('SELF-CHECK: the scanner no longer sees Object.assign(G, {…}) literal keys — the b486 smuggling blind spot is back.');
    }
    // The census must gain the literal keys but NOT the alias-written field name
    // (aliases are flagged at the root, not attributed — names are reused).
    if (probe.fields.has('probeAliasField')) {
      fail('SELF-CHECK: an alias-written field must not be attributed to the census by name (reused-name false-positive risk).');
    }
    // Both smuggling shapes — the opaque Object.assign AND the alias root — must
    // surface as problems; the comment/string mentions must NOT.
    if (!probe.problems.some((p) => p.includes('someOpaqueSplat'))) {
      fail('SELF-CHECK: the scanner no longer flags an opaque Object.assign(G, expr) — an un-homed field could be smuggled in unseen.');
    }
    if (!probe.problems.some((p) => p.startsWith('probeAlias = G;'))) {
      fail('SELF-CHECK: the scanner no longer flags a non-idiom `X = G;` alias root — the alias-write blind spot is back.');
    }
    if (probe.problems.some((p) => p.includes('blobInComment')) || probe.problems.some((p) => p.includes('a string with'))) {
      fail('SELF-CHECK: the scanner is matching code-shaped text inside comments/strings (stripCode regressed) — expect false failures.');
    }
  }

  // ── The homing mechanisms, read from source so they cannot drift. ──
  let recordFields, residueFields, noSyncFields, censusFromSource;
  let smuggles = [];
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
    const scan = await scanGFieldWrites();
    censusFromSource = scan.found;
    smuggles = scan.smuggles;
  } catch (e) {
    fail('could not load the homing sets, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  // ── THE SMUGGLING SITES: an opaque, un-allowlisted Object.assign(G, expr). ──
  // Such a site splats an object the field scanner cannot read — it could carry a
  // field homed by NOTHING, stranded under arm (the bestiary class, past the
  // static net). Allowlist it in OBJECT_ASSIGN_ALLOW only if it is a known
  // inert-under-arm blob-splat, or replace it with explicit `G.field =` writes.
  for (const s of smuggles) {
    fail(`an opaque \`${s.call}\` in ${s.file} splats an object into G the field scanner cannot see — it could `
       + `introduce a field homed by NOTHING (stranded under BLOB_RETIRED, the bestiary class past the regex). `
       + `Allowlist its exact argument in OBJECT_ASSIGN_ALLOW if it is a known inert-under-arm blob-splat, or write `
       + `the fields as explicit \`G.field =\` assignments so the census sees them.`);
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

  // ── THE LOAD-PATH CALL WIRING (b477; DERIVED b50x — SA-016). ────────────────
  // Listing a field as a SERVER_MECHANISM above only claims a reconcile<X> EXISTS
  // — it does NOT prove settle() (the idle-boot / hr_load handler in record.js)
  // actually CALLS it. That gap shipped the "invisible crew" bug: reconcileWorkers
  // existed and was unit-tested, but settle() never invoked it, so on an IDLE boot
  // (hr-accrue → accrued:false, applyEnvelopeState never runs) the roster was never
  // hydrated and a player with a producing crew saw G.workers.hired=[] (QA
  // 0a47ba77, live). Every reconcile that hydrates a server field on the load path
  // MUST be called in record.js, or an idle boot silently drops it.
  //
  // ⚠ WHY THIS IS NOW DERIVED, NOT HAND-TYPED. The list used to be a literal
  // MUST_CALL array — an ALLOWLIST, so a reconcile the array forgot passed green.
  // That is EXACTLY how SA-016 shipped: reconcileHeroSlots existed in accrue.js and
  // was called only from applyEnvelopeState (the accrue path), the hand-list never
  // named it, and record.js's load path never called it — so on an idle/backgrounded
  // tab (accrue is visibility-gated) `G._heroSlots` stayed absent and the Hero-slot
  // Buy sat on "Checking…" forever (QA slot 4, live 2026-09-04). A hand-maintained
  // list of what-must-be-wired can only catch the omissions somebody remembered.
  //
  // So the required set is DERIVED from accrue.js's EXPORTS: every
  // `export function reconcile<X>(G, …)` is a G-hydrator for a server-projected
  // field, and this is the SAME registry the record/reconcile system consumes, so
  // the two cannot drift. A reconcile is REQUIRED-BY-DEFAULT (the safe direction);
  // the ONLY escape is the documented residue-homed exemption below. Adding a new
  // reconcile to accrue.js now REDS the guard until it is wired into record.js's
  // load path or deliberately exempted — the omission cannot be silent again.
  try {
    const recSrc = await readFile(new URL('src/net/record.js', ROOT), 'utf8');
    const accSrc = stripCode(await readFile(new URL('src/net/accrue.js', ROOT), 'utf8'));
    const recCode = stripCode(recSrc);   // ignore reconcile names mentioned only in comments

    // DERIVE the reconcile registry: every `export function reconcile<X>(G` in accrue.js.
    const ALL_RECONCILES = [...accSrc.matchAll(/export\s+function\s+(reconcile[A-Za-z0-9_]+)\s*\(\s*G\b/g)]
      .map((m) => m[1]);

    /* THE ONLY ESCAPE — a DENYLIST, not an allowlist. A reconcile belongs here iff
       the field it hydrates is RESIDUE-homed (client-state.js RESIDUE_FIELDS), so
       hydrateInto rebuilds the player's own value on every load and the load-path
       reconcile would only ADD the server's cross-device copy — an enhancement, not
       a strand-fix. Exempting one is a deliberate, documented claim that losing the
       server's copy on an idle boot is invisible because the residue carries it.
       Contrast hero slots: the `_heroSlots` scratch is deliberately NOT persisted
       (reconcileHeroSlots' header — a cold boot must read "checking", not a lit
       Buy), so its load-path reconcile is REQUIRED, and it is NOT exempt here. */
    const RESIDUE_HOMED_EXEMPT = new Set([
      // combatStyle is in RESIDUE_FIELDS → hydrateInto restores the player's own
      // last pick on every load; reconcileCombatStyle only layers the server's
      // cross-device map on top, which is not required to avoid a strand.
      'reconcileCombatStyle',
    ]);

    // META-ASSERTIONS so the derivation cannot rot into a vacuous pass:
    //  (i) the scan must actually SEE the reconciles — a broken regex would empty
    //      the set and every call-check below would pass trivially.
    if (ALL_RECONCILES.length < 6) {
      fail(`the reconcile-registry scan found only ${ALL_RECONCILES.length} \`export function reconcile*(G\` in `
         + `accrue.js (expected >= 6) — the derivation regex has drifted and the required set is nearly empty, so `
         + `the load-path wiring check would pass VACUOUSLY. Fix the scan before trusting a green run.`);
    }
    //  (ii) every exemption must name a REAL export — a stale name would silently
    //       shrink the required set (the SA-016 hole, reopened via the denylist).
    for (const fn of RESIDUE_HOMED_EXEMPT) {
      if (!ALL_RECONCILES.includes(fn)) {
        fail(`'${fn}' is in RESIDUE_HOMED_EXEMPT but accrue.js no longer exports it. A stale exemption silently `
           + `shrinks the required-reconcile set — remove it or fix the name.`);
      }
    }

    const MUST_CALL = ALL_RECONCILES.filter((fn) => !RESIDUE_HOMED_EXEMPT.has(fn));
    for (const fn of MUST_CALL) {
      // a CALL, not merely the import — `fn(` with G as the first arg on the load path.
      const called = new RegExp(fn + '\\s*\\(\\s*G\\b').test(recCode);
      if (!called) {
        fail(`'${fn}' is a reconcile mechanism EXPORTED by accrue.js but record.js's load path never CALLS it (no `
           + `\`${fn}(G…\`). Listing/exporting the reconcile is not enough — an IDLE or backgrounded boot answers `
           + `accrued:false (and accrue is visibility-gated) so applyEnvelopeState may NEVER run; the reconcile MUST `
           + `be invoked in settle() from the hr_load envelope or the field silently resets/stalls on reload (b477 `
           + `invisible-crew / SA-016 hero-slot "Checking…" class). If it is legitimately residue-homed and the `
           + `load-path call is only a cross-device enhancement, add it to RESIDUE_HOMED_EXEMPT with the reason.`);
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
