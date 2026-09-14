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
const CENSUS_SKIP = (rel) => rel === 'src/features/smoke-test.js' || rel.startsWith('src/features/smoke/');

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
      else if (e.name.endsWith('.js') && !CENSUS_SKIP(child)) files.push(child);
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
    /* ⚠ `ownedThemes` / `ownedCosmetics` LEFT THIS CENSUS ON 2026-09-14 because
       they left the GAME. They are not un-homed fields that someone forgot to
       persist — they no longer exist: hr_buy_gem_unlock made ownership of a
       theme or a cosmetic a player_progress flag, hr_state_of projects the
       account's owned set, and src/legacy.js ownsGemUnlock reads ONLY that. The
       two fields were deleted from the fresh-character literal, from
       RESIDUE_FIELDS and from every writer in src/, so asserting a home for them
       here would demand a persistence home for state the client no longer holds
       — and the only way to satisfy it would be to put the forgeable bag back.
       If either name ever reappears as a `G` write, the SCANNER (not this list)
       catches it, unhomed, exactly as it should. */
    'settings', 'houseTheme', 'plotBuildings',
    'daily', 'collection', 'quests', 'entitlements', 'lastSeen', 'createdAt',
    // other persisted top-level state
    'marks', 'gems', 'plotLevels', 'workers', 'enchant',
    /* ⚠ `ownedThemes`, `ownedCosmetics`, `autoEatPct`, `heroSlotsUnlocked` LEFT THIS
       LIST on 2026-09-14 — not because they were forgotten, but because the game no
       longer writes them at all. They are enforced by PURGED_TO_PROJECTION below,
       which is strictly stronger than a homing claim: it fails if any of them is
       written OR re-added to the residue. */
  ];

  /* ── THE TOMBSTONES (2026-09-14, the projection purge) ─────────────────────
     A residue field that shadowed a server projection was DELETED, and the class
     comes back one "harmless little cache" at a time unless something bites. For
     each name: the server key that holds the fact, and the reader the client goes
     through. The guard fails if the name is written into G anywhere in src/, or if
     it reappears on RESIDUE_FIELDS.
     ⚠ `combatStyle` and `toolCarry` are NOT here: they are still written (by their
       reconciles), and are registered in SERVER_MECHANISM_FIELDS instead. */
  const PURGED_TO_PROJECTION = new Map([
    ['ownedThemes', "hr_state_of `gem_unlocks` → accrue.js reconcileGemUnlocks → legacy.js ownsGemUnlock"],
    ['ownedCosmetics', "hr_state_of `gem_unlocks` → accrue.js reconcileGemUnlocks → legacy.js ownsGemUnlock"],
    ['autoEatPct', "hr_state_of `state.auto_eat_pct` → HearthriseAuto.eatThreshold()"],
    ['heroSlotsUnlocked', "hr_state_of `hero_slots` → accrue.js reconcileHeroSlots → multi-character.js ownsSlot()"],
    ['streak', "hr_state_of `state.streak_days` → accrue.js reconcilePlayStreak → playStreakDays()"],
    ['renownHigh', "hr_state_of `renown_high` → renown.js countedRenown() (the local ratchet is NO_SYNC)"],
  ]);

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
    /* ⚠ THE TWO ENTRIES THAT PROVED THIS ALLOWLIST NEEDED TEETH. Both are
       accrue.js reconcileFarm (b448) — and `plotLevels` sat here green for
       weeks while hr_state_of projected NO plot_level at all, so the field was
       homed by NOTHING and every armed reload reset a paid Plot Lv 3 to Lv 1.
       A hand-typed name is a claim; these two are now EXECUTED at the bottom of
       this file against a projected envelope, and the projection they depend on
       is read out of the migration. Do the same for the next one you add. */
    'farmPlots',   // VERIFIED below: reconcileFarm rebuilds the plots + waterings
    'plotLevels',  // VERIFIED below: reconcileFarm mirrors state.plot_level (Q-2)
    /* b466: traits — accrue.js reconcileTraits MIRRORS the envelope's `traits`
       array (hr_state_of projects the player_progress `trait:<id>` rows
       hr_trait_buy writes) onto G.traits on every load, in BOTH directions, so
       an unprojected trait is removed rather than kept forever. A paid entitlement with
       a server row must be homed HERE, not duplicated into the residue bag. */
    'traits',
    /* b522: consecFalls — accrue.js reconcileFall mirrors state.consec_falls (the
       Retreat counter, Recovery rev.3) onto G on every envelope, and record.js
       calls reconcileFall(G, …) from the idle-boot hydration step, so a reload
       cannot strand it. Server-owned, written only by hr_apply within [0, 64].
       VERIFIED below by driving the real reconcileFall through a projected
       envelope, the same way farmPlots/plotLevels are. */
    'consecFalls',
    /* 2026-09-13 — buffs: accrue.js reconcileBuffs MIRRORS the envelope's top-level
       `buffs` projection (player_state.buffs, written only by hr_apply's
       buff_apply block) onto G.buffs on every envelope, and record.js calls it from
       the idle-boot hydration step, so a reload repaints the pill instead of
       forgetting it. ABSOLUTE — the server's array replaces the local queue, so a
       local entry the server does not hold cannot survive (the residue-ahead class
       this field WAS, when it lived in RESIDUE_FIELDS as a player-written
       remainingMs). VERIFIED below against a projected envelope. */
    'buffs',
    /* 2026-09-14 — the projection purge. Both were RESIDUE copies of a real
       server column, and both now have a mirror on the load path:
         · combatStyle — accrue.js reconcileCombatStyle merges `state.combat_style`
           (hr_set_style is its only writer) server-wins-per-family on every
           envelope and re-sends any family the server has no opinion about, so the
           picker shows the routing the ENGINE pays XP into ("only Attack saves");
         · toolCarry   — accrue.js reconcileToolCarry mirrors `state.tool_carry`
           (2026-08-15-tool-carry.sql; hr_apply validates the engine's delta and
           hr_state_of projects it), and record.js hydrates it on an idle boot.
       VERIFIED below against projected envelopes, like their neighbours. */
    'combatStyle',
    'toolCarry',
    /* 2026-09-14 — gem unlocks land in the `_gemUnlocks` SCRATCH, not in G, so
       they are not in this census at all. Named here only so the next reader does
       not go looking: ownership is legacy.js ownsGemUnlock → accrue.js
       reconcileGemUnlocks → the envelope's `gem_unlocks`. */
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

  // ── THE TOMBSTONE ASSERTION (see PURGED_TO_PROJECTION). ──
  for (const [f, where] of PURGED_TO_PROJECTION) {
    if (residueFields.has(f)) {
      fail(`'${f}' is back on RESIDUE_FIELDS. It was deleted on 2026-09-14 because it was a SECOND copy of a `
         + `value the server projects (${where}). A persisted client copy of a server-owned fact is CLAUDE.md `
         + "§6's residue-ahead class — read the projection instead.");
    }
    /* `renownHigh` is still WRITTEN (the in-session prediction ratchet) and is
       declared in NO_SYNC; the others must have no writer left at all. */
    if (f !== 'renownHigh' && censusFromSource.has(f)) {
      fail(`'${f}' is written into G by src/ again. It was deleted on 2026-09-14 in favour of the server's own `
         + `value (${where}); a new writer means the browser can say one thing while the server says another.`);
    }
  }

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
  /* ⚠ THE UNION OF EVERY DENY-LIST MIGRATION, NOT JUST THE FIRST ONE (2026-09-13).
     This read named 2026-08-22-client-state-denylist.sql alone, and the moment a
     LATER migration added a key by anchored patch — which is how they are added,
     because that body is ten patches deep and may not be restated — the guard
     went blind to it. `buffs` was the first: it moved from RESIDUE_FIELDS to the
     deny-list in 2026-09-13-client-state-buffs-denylist.sql, and had the two
     halves shipped apart, the server would have refused EVERY residue patch with
     forbidden_field (it refuses the whole patch, not the key) and this check would
     have said nothing. SOURCES is a list on purpose: a new deny-list file is one
     line here, and a MISSING file is a hard failure rather than a quiet shrink. */
  try {
    const SOURCES = [
      'supabase/migrations/2026-08-22-client-state-denylist.sql',
      'supabase/migrations/2026-09-13-client-state-buffs-denylist.sql',
    ];
    const deny = new Set();
    let read = 0;
    for (const rel of SOURCES) {
      const sql = await readFile(new URL(rel, ROOT), 'utf8');
      /* Two idioms, because the two files add keys two ways: the original
         DECLARES the array, and a patcher SPLICES onto its tail inside a
         `replace(v_def, c_anchor, c_anchor || $new$, 'key'$new$)`. Both are
         scanned; a file that yields no key at all is reported, because a regex
         that has drifted looks exactly like a file with nothing to add. */
      const arr = /v_deny\s+constant\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(sql);
      const spliced = [...sql.matchAll(/\$new\$[\s\S]*?\$new\$/g)].map((m) => m[0]).join('\n');
      const before = deny.size;
      for (const src of [arr && arr[1], spliced]) {
        if (!src) continue;
        for (const m of src.matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) deny.add(m[1]);
      }
      if (deny.size === before && !arr) {
        fail(`${rel} contributed NO deny-list key — either it is not a deny-list migration any more or `
           + 'the scan has drifted, and either way the residue/authority collision check is weaker than '
           + 'it reads.');
      } else {
        read += 1;
      }
    }
    if (read !== SOURCES.length || deny.size < 18) {
      fail(`the hr_put_client_state deny-list scan read ${read}/${SOURCES.length} migrations and found `
         + `${deny.size} keys (expected every file and >= 18 keys) — the residue/authority collision `
         + 'check would pass VACUOUSLY.');
    } else {
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

  // ── THE BANK MECHANISM IS **DRIVEN**, NOT TAKEN ON TRUST (SA-010). ─────────
  // `bank` sat in SERVER_MECHANISM_FIELDS above naming `reconcileBank` — a
  // hand-typed claim the code CONTRADICTED. reconcileBank reconciles the item
  // STORE, is inert in prod (invAbsolute false), and explicitly only CARRIES the
  // purchase counters through; nothing restored them, so `G.bank.goldBuys` reset
  // to 0 on every reload and every purchased rung was forgotten (the cap snapped
  // back to the 100 base and Buy answered "that bank space is already yours" once
  // per owned rung). A membership test can never catch that: listing a field only
  // asserts SOME function names it. So this check RUNS the mechanism against an
  // envelope fixture carrying purchased rungs and asserts G.bank actually gains
  // them — the same standard the load-path wiring check applies to the call.
  try {
    const acc = await import(mod('src/net/accrue.js'));
    if (typeof acc.reconcileBankRungs !== 'function') {
      fail("'bank' is listed as a SERVER_MECHANISM field but accrue.js exports no reconcileBankRungs — the "
         + 'purchased rungs (G.bank.goldBuys, which IS the bank cap) would be homed by nothing and reset on '
         + 'every reload (SA-010).');
    } else {
      /* The wire shape hr_state_of projects: a permanent unlock row per ladder,
         plus the completeness flag that licenses an exact (lowerable) reading. */
      const envelope = (rungs, extra) => Object.assign({
        progress: [
          { kind: 'unlock', key: 'bank', value: rungs, period: '' },
          { kind: 'unlock', key: 'worker_hire', value: 1, period: '' },
        ],
        progress_truncated: false,
      }, extra || {});

      // 1 — A FRESH G (the reload) must GAIN the two purchased rungs.
      const fresh = { bank: { goldBuys: 0, gemBuys: 0, grandfather: 0 } };
      acc.reconcileBankRungs(fresh, envelope(2));
      if (fresh.bank.goldBuys !== 2) {
        fail('reconcileBankRungs did not restore the purchased rungs from the envelope — expected '
           + `G.bank.goldBuys === 2, got ${JSON.stringify(fresh.bank.goldBuys)}. This is SA-010: the bank cap `
           + 'is derived from that counter and nothing else homes it.');
      }
      // 2 — IDEMPOTENT: re-applying the same envelope must not compound.
      acc.reconcileBankRungs(fresh, envelope(2));
      if (fresh.bank.goldBuys !== 2) {
        fail(`reconcileBankRungs is not idempotent — a second identical envelope moved goldBuys to ${fresh.bank.goldBuys}.`);
      }
      // 3 — The NON-server counters are never touched by the rung reader.
      if (fresh.bank.gemBuys !== 0 || fresh.bank.grandfather !== 0) {
        fail('reconcileBankRungs touched a counter the server does not state (gemBuys/grandfather) — those have '
           + 'no server row and must be left exactly alone.');
      }
      // 4 — UNKNOWN (no `progress` array) must leave a populated bank ALONE.
      const held = { bank: { goldBuys: 5 } };
      acc.reconcileBankRungs(held, { ok: true });
      if (held.bank.goldBuys !== 5) {
        fail('reconcileBankRungs read an envelope with NO `progress` array as a statement of zero — absence is not '
           + `a claim, and it just deleted five paid rungs (got ${held.bank.goldBuys}).`);
      }
      // 5 — A TRUNCATED statement is a FLOOR: it may raise, never lower.
      const ahead = { bank: { goldBuys: 4 } };
      acc.reconcileBankRungs(ahead, envelope(1, { progress_truncated: true }));
      if (ahead.bank.goldBuys !== 4) {
        fail('a `progress_truncated` envelope LOWERED the bank rungs — a clipped projection may raise but never '
           + `lower (the b502 exact-vs-floor rule); got ${ahead.bank.goldBuys}.`);
      }
      // 6 — A COMPLETE statement is truth in BOTH directions (the residue-ahead
      //     deadlock: a client above the server asks for a rung SQL refuses).
      acc.reconcileBankRungs(ahead, envelope(1));
      if (ahead.bank.goldBuys !== 1) {
        fail('a COMPLETE `progress` projection did not LOWER a client-ahead rung count — that is the property-tier '
           + `deadlock class (the server refuses the next buy as rung_order, forever); got ${ahead.bank.goldBuys}.`);
      }
    }
  } catch (e) {
    fail('the bank-mechanism drive check threw: ' + (e && e.message));
  }

  // The other two bank counters (gemBuys/grandfather) have NO server row to read
  // back — they are client-authored and are deliberately untouched above.
  // bountyHunter.marks was the historic nested-authority trap — now top-level
  // G.marks (b443), asserted above.
  /* ── THE MECHANISM CLAIMS ARE NOW *EXECUTED*, NOT HAND-TYPED (Q-2/Q-5) ─────
     SERVER_MECHANISM_FIELDS is an allowlist of NAMES, and a name on it is a
     CLAIM that a reconcile writes the field on the load path. Until now nothing
     checked the claim, and the farm entries proved why: `plotLevels` had sat on
     the list since b448 while accrue.js's own header said, in prose, that
     hr_state_of "has no plot_level key … an armed farm reads as Lv 1". The
     guard was green for weeks over a field that was homed by NOTHING — the
     exact strand this file exists to catch, hidden behind its own allowlist.

     So the two farm fields are DRIVEN: build an envelope shaped like the one
     hr_state_of returns, run the REAL reconcileFarm through it with the arm
     stubbed on, and require the field to actually appear in a fresh G. And to
     stop the FIXTURE from becoming the next unverified claim, every key it uses
     is first proven present in the migration that projects it — a projection
     renamed server-side fails here even though the client code never changed.

     Deliberately narrow: two fields, in-process, no database, no browser (this
     runs as a suite preflight). The full round trip — real RPCs writing the
     rows, the real chain projecting them, growthHours agreeing with
     hr_farm_growth_hours — is tests/state-of-farm-projection.mjs. */
  try {
    const PROJ = '2026-09-06-state-of-farm-projection.sql';
    const sql = await readFile(new URL('supabase/migrations/' + PROJ, ROOT), 'utf8');
    /* The needles are the SEC-1 SPLICE lines specifically — not the Sec 2 gate's
       own position() checks, whose SQL-escaped text is a superstring of the
       splice's and would keep matching after the splice had been renamed away. */
    for (const [key, needle] of [['plot_level', "      ''plot_level'', v_st.plot_level,');"],
      ['waterings', "                                          'waterings', coalesce(to_jsonb(waterings), '[]'::jsonb))$new$);"]]) {
      if (!sql.includes(needle)) {
        fail(`${PROJ} no longer splices the '${key}' projection into hr_state_of, so the fixture below is `
           + `asserting against a key the server does not send. Q-2 (farm tier resets to Lv 1) / Q-5 `
           + `(multi-watering collapses to one) are back. Do not "fix" this by editing the fixture.`);
      }
    }

    const A = await import(mod('src/net/accrue.js'));
    if (typeof A.reconcileFarm !== 'function') {
      fail('accrue.js no longer exports reconcileFarm, so the farmPlots/plotLevels mechanism claims in '
         + 'SERVER_MECHANISM_FIELDS are unverifiable — and unverified is how plotLevels stayed on that list '
         + 'for weeks while nothing wrote it.');
    } else {
      const now = Date.now();
      const env = {
        ok: true,
        state: { plot_level: 3 },
        farm: [{
          i: 0,
          crop: 'turnip',
          planted_at: new Date(now - 3600e3).toISOString(),
          watered_at: new Date(now - 600e3).toISOString(),
          waterings: [new Date(now - 1800e3).toISOString(), new Date(now - 600e3).toISOString()],
        }],
      };
      // reconcileFarm is arm-gated on window.HearthriseCapstone.isBlobRetired()
      // and reads window.HearthriseFarm.isReady — both at CALL time.
      const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
      const prev = globalThis.window;
      globalThis.window = { HearthriseCapstone: { isBlobRetired: () => true } };
      let G = {};
      try { A.reconcileFarm(G, env, { authoritative: true }); }
      finally { if (had) globalThis.window = prev; else delete globalThis.window; }

      if (!Array.isArray(G.farmPlots) || !G.farmPlots[0] || G.farmPlots[0].cropId !== 'turnip') {
        fail("SERVER_MECHANISM_FIELDS claims 'farmPlots' is homed by reconcileFarm, but driving the real "
           + 'reconcile with a projected envelope did not rebuild the plot. Under BLOB_RETIRED every standing '
           + 'crop vanishes on reload.');
      }
      if (!Array.isArray(G.farmPlots?.[0]?.waterings) || G.farmPlots[0].waterings.length !== 2) {
        fail("reconcileFarm did not mirror the projected `waterings` ARRAY (got "
           + `${JSON.stringify(G.farmPlots?.[0]?.waterings)}). That is Q-5: the client rebuilds a one-element `
           + "history, its growthHours under-counts, and a crop the server calls ready is stranded behind a "
           + 'Water button.');
      }
      if (G.plotLevels !== 3) {
        fail("SERVER_MECHANISM_FIELDS claims 'plotLevels' is homed by reconcileFarm, but driving the real "
           + `reconcile with an envelope carrying state.plot_level=3 left G.plotLevels = ${G.plotLevels}. `
           + 'That is Q-2: a paid Plot Lv 3 reads back as Lv 1 on every reload, unlocked seeds vanish, and the '
           + 'Upgrade button quotes a tier the server is not charging.');
      }
      // …and the fail-safe direction: an envelope WITHOUT the key must not
      // invent or reset the tier (save invariant 2 — act only on certainty).
      const G2 = { plotLevels: 4 };
      const had2 = Object.prototype.hasOwnProperty.call(globalThis, 'window');
      const prev2 = globalThis.window;
      globalThis.window = { HearthriseCapstone: { isBlobRetired: () => true } };
      try { A.reconcileFarm(G2, { ok: true, state: {}, farm: env.farm }, { authoritative: true }); }
      finally { if (had2) globalThis.window = prev2; else delete globalThis.window; }
      if (G2.plotLevels !== 4) {
        fail('an envelope without state.plot_level must leave G.plotLevels UNTOUCHED (a server predating the '
           + `projection must not reset a known tier); got ${G2.plotLevels}.`);
      }
    }
  } catch (e) {
    fail('the EXECUTED farm-mechanism check threw, so the farmPlots/plotLevels claims went unverified: '
       + (e && e.message));
  }

  /* ── EXECUTED: consecFalls (b522). The claim above is a name until reconcileFall
     is DRIVEN. The projection needle is the §2 splice line of the Retreat
     migration — if hr_state_of stops projecting consec_falls, the fixture below
     would assert against a key the server never sends. */
  try {
    const PROJ = '2026-09-07-retreat.sql';
    const sql = await readFile(new URL('supabase/migrations/' + PROJ, ROOT), 'utf8');
    if (!sql.includes("      'consec_falls', v_st.consec_falls,$anc$);")) {
      fail(`${PROJ} no longer splices the 'consec_falls' projection into hr_state_of, so the consecFalls `
         + 'fixture below is asserting against a key the server does not send. The Retreat would arm off a '
         + 'number the client never receives. Do not "fix" this by editing the fixture.');
    }
    const A = await import(mod('src/net/accrue.js'));
    if (typeof A.reconcileFall !== 'function') {
      fail("accrue.js no longer exports reconcileFall, so the 'consecFalls' mechanism claim in "
         + 'SERVER_MECHANISM_FIELDS is unverifiable.');
    } else {
      const G = {};
      A.reconcileFall(G, { ok: true, state: { consec_falls: 3 } });
      if (G.consecFalls !== 3) {
        fail("SERVER_MECHANISM_FIELDS claims 'consecFalls' is homed by reconcileFall, but driving the real "
           + `reconcile with state.consec_falls=3 left G.consecFalls = ${G.consecFalls}. On reload the Retreat `
           + 'counter is stranded and a fourth foodless fall goes through.');
      }
      // Fail-safe direction: an ABSENT key must leave the field alone (an
      // invented 0 arms a client rule against a database that cannot back it).
      const G2 = { consecFalls: 2 };
      A.reconcileFall(G2, { ok: true, state: {} });
      if (G2.consecFalls !== 2) {
        fail(`an envelope without state.consec_falls must leave G.consecFalls UNTOUCHED; got ${G2.consecFalls}.`);
      }
      const G3 = {};
      A.reconcileFall(G3, { ok: true, state: {} });
      if (Object.prototype.hasOwnProperty.call(G3, 'consecFalls')) {
        fail('an envelope without state.consec_falls must not INVENT G.consecFalls (resolveDeath gates the whole '
           + `Retreat on this being a number); got ${G3.consecFalls}.`);
      }
    }
  } catch (e) {
    fail('the EXECUTED consecFalls-mechanism check threw, so the claim went unverified: ' + (e && e.message));
  }

  /* ── EXECUTED: buffs (2026-09-13). The projection needle is the §1 splice of the
     consumable-buffs migration — if hr_state_of stops projecting the top-level
     `buffs` block, the fixture below would assert against a key the server never
     sends and the pill would be blank on every reload with the guard green. */
  try {
    const PROJ = '2026-09-13-consumable-buffs.sql';
    const sql = await readFile(new URL('supabase/migrations/' + PROJ, ROOT), 'utf8');
    if (!sql.includes("    'buffs', coalesce((")) {
      fail(`${PROJ} no longer splices the top-level 'buffs' projection into hr_state_of, so the buffs `
         + 'fixture below is asserting against a key the server does not send. Do not "fix" this by editing '
         + 'the fixture.');
    }
    if (!sql.includes("'remaining_ms', greatest(0, floor(")) {
      fail(`${PROJ} no longer projects a server-derived remaining_ms, so the countdown the player watches `
         + "would have to be re-derived from `until` against the CLIENT clock — a skewed clock then becomes an "
         + 'input to how long a buff has left.');
    }
    const A = await import(mod('src/net/accrue.js'));
    if (typeof A.reconcileBuffs !== 'function') {
      fail("accrue.js no longer exports reconcileBuffs, so the 'buffs' mechanism claim in "
         + 'SERVER_MECHANISM_FIELDS is unverifiable — and a reload would forget a running buff while the '
         + 'server went on paying it.');
    } else {
      const iso = (ms) => new Date(Date.now() + ms).toISOString();
      const G = {};
      /* TWO SEGMENTS OF ONE TYPE and one expired entry, which is the real
         projection shape: hr_state_of carries a dead buff at remaining_ms = 0 for
         the away engine, and the queue may hold several contiguous windows of a
         type since the 2026-09-13 per-segment ruling. */
      A.reconcileBuffs(G, {
        ok: true,
        buffs: [
          { type: 'damage', magnitude: 5, until: iso(60000), remaining_ms: 60000 },
          { type: 'damage', magnitude: 1, until: iso(80000), remaining_ms: 80000 },
          { type: 'all_xp', magnitude: 2, until: iso(-1000), remaining_ms: 0 },
        ],
      });
      if (!Array.isArray(G.buffs) || G.buffs.length !== 2) {
        fail("SERVER_MECHANISM_FIELDS claims 'buffs' is homed by reconcileBuffs, but driving the real "
           + `reconcile with two live segments and one expired entry left G.buffs = ${JSON.stringify(G.buffs)} `
           + '(expected the two live ones). On reload the pill is wrong or blank.');
      } else if (G.buffs[0].remainingMs !== 60000 || G.buffs[0].magnitude !== 5) {
        fail('reconcileBuffs must carry EVERY segment and sort by remainder so the RUNNING one is first; got '
           + `${JSON.stringify(G.buffs)}. Collapsing by type is how a weak helping paints a Feast's magnitude.`);
      }
      // ABSENCE IS NOT A STATEMENT: an envelope with no `buffs` key leaves it alone.
      const G2 = { buffs: [{ type: 'damage', magnitude: 5, remainingMs: 1000 }] };
      A.reconcileBuffs(G2, { ok: true, state: {} });
      if (!Array.isArray(G2.buffs) || G2.buffs.length !== 1) {
        fail('an envelope without a `buffs` key must leave G.buffs UNTOUCHED (a server predating the '
           + `projection is not a statement that you hold nothing); got ${JSON.stringify(G2.buffs)}.`);
      }
      // An EMPTY ARRAY *is* a statement, and it must clear — that is how a drained buff disappears.
      const G3 = { buffs: [{ type: 'damage', magnitude: 5, remainingMs: 1000 }] };
      A.reconcileBuffs(G3, { ok: true, buffs: [] });
      if (!Array.isArray(G3.buffs) || G3.buffs.length !== 0) {
        fail('an envelope stating `buffs: []` must CLEAR the local queue — a local entry the server does not '
           + `hold is the residue-ahead class this field used to be; got ${JSON.stringify(G3.buffs)}.`);
      }
    }
  } catch (e) {
    fail('the EXECUTED buffs-mechanism check threw, so the claim went unverified: ' + (e && e.message));
  }
  /* ── EXECUTED: combatStyle + toolCarry (2026-09-14, the projection purge).
     Both names left RESIDUE_FIELDS in the same change, so a claim that they are
     "homed by a reconcile" is exactly the kind of hand-typed assertion that let
     `plotLevels` sit green while nothing projected it. Driven for real. */
  try {
    const A = await import(mod('src/net/accrue.js'));
    if (typeof A.reconcileCombatStyle !== 'function' || typeof A.reconcileToolCarry !== 'function') {
      fail("accrue.js no longer exports reconcileCombatStyle/reconcileToolCarry, so the 'combatStyle' and "
         + "'toolCarry' mechanism claims in SERVER_MECHANISM_FIELDS are unverifiable — and neither field is "
         + 'persisted any more, so a reload would reset the style routing and the fractional carry.');
    } else {
      // THE STYLE: the server's map wins per family, and absence changes nothing.
      const G = { combatStyle: { sword: 'controlled' } };
      A.reconcileCombatStyle(G, { ok: true, state: { combat_style: { sword: 'aggressive' } } });
      if (!G.combatStyle || G.combatStyle.sword !== 'aggressive') {
        fail("SERVER_MECHANISM_FIELDS claims 'combatStyle' is homed by reconcileCombatStyle, but driving the "
           + `real reconcile with a server map left G.combatStyle = ${JSON.stringify(G.combatStyle)}. The picker `
           + 'would show a routing the engine does not pay.');
      }
      const G2 = { combatStyle: { sword: 'aggressive' } };
      A.reconcileCombatStyle(G2, { ok: true, state: {} });
      if (!G2.combatStyle || G2.combatStyle.sword !== 'aggressive') {
        fail('an envelope without `state.combat_style` must leave G.combatStyle UNTOUCHED (a lean envelope is '
           + `not a statement that you chose nothing); got ${JSON.stringify(G2.combatStyle)}.`);
      }
      // THE CARRY: the server's fractions replace the prediction; absence leaves it.
      const G3 = { toolCarry: { woodcutting: 0.9 } };
      A.reconcileToolCarry(G3, { ok: true, state: { tool_carry: { woodcutting: 0.25, mining: 0.5 } } });
      if (!G3.toolCarry || G3.toolCarry.woodcutting !== 0.25 || G3.toolCarry.mining !== 0.5) {
        fail("SERVER_MECHANISM_FIELDS claims 'toolCarry' is homed by reconcileToolCarry, but driving the real "
           + `reconcile left G.toolCarry = ${JSON.stringify(G3.toolCarry)} (expected the server's fractions). `
           + 'Every reload would reset the carry the settle is still holding.');
      }
      const G4 = { toolCarry: { mining: 0.4 } };
      A.reconcileToolCarry(G4, { ok: true, state: {} });
      if (!G4.toolCarry || G4.toolCarry.mining !== 0.4) {
        fail('an envelope without `state.tool_carry` must leave G.toolCarry UNTOUCHED — never evict on '
           + `uncertainty (CLAUDE.md §6); got ${JSON.stringify(G4.toolCarry)}.`);
      }
      // A fraction outside [0,1) is not a carry and must not be adopted.
      const G5 = {};
      A.reconcileToolCarry(G5, { ok: true, state: { tool_carry: { mining: 7, fishing: 0.5 } } });
      if (!G5.toolCarry || 'mining' in G5.toolCarry || G5.toolCarry.fishing !== 0.5) {
        fail('reconcileToolCarry must drop a carry outside [0,1) — advanceToolCarry pays out whole units, so a '
           + `7 is not a remainder; got ${JSON.stringify(G5.toolCarry)}.`);
      }
    }
  } catch (e) {
    fail('the EXECUTED combatStyle/toolCarry mechanism check threw, so the claims went unverified: '
       + (e && e.message));
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
