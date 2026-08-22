// ============================================================================
// tests/blob-retire.mjs — THE SERVER-AUTHORITY CAPSTONE, PROVEN BOTH WAYS.
//
// The capstone (src/net/capstone.js) retires the client save blob: under one
// flag (BLOB_RETIRED, DORMANT) the whole character loads from the server, the
// save ships only residue, and the reconcile modal is bypassed. This guard
// proves:
//   · DORMANT — nothing changes: the flag is false, clientField reads G[field]
//     byte-for-byte, snapshot() still carries the residue, canProceedArmed is a
//     no-op true, and the b305 anti-rollback model is untouched (the reconcile
//     path is not even entered until armed).
//   · ARMED — the new model holds: clientField reads the SERVER bag, the residue
//     patch is built for putClientState, and — critically — the fail-closed /
//     anti-data-loss property is real: an ABSENT / GARBAGE / pre-envelope server
//     answer leaves canProceedArmed FALSE, so the client never proceeds to
//     author or upload a character, never falls back to a local authored save.
//
// Run standalone:  node tests/blob-retire.mjs
// Wired into the suite as a preflight (blobRetireGuard).
// ============================================================================
const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function blobRetireGuard() {
  const problems = [];
  const fail = (m) => problems.push('blob-retire: ' + m);

  // Some modules (events.js) register a window global at top-level eval. A tiny
  // shim lets them import under Node; it also exercises the client-state ↔ capstone
  // window coupling the way the browser wires it.
  if (typeof globalThis.window === 'undefined') globalThis.window = {};

  let C, CS, R, A, E;
  try {
    // ⚠ MATCH THE SPECIFIERS capstone.js USES. capstone.js imports
    // `./accrue.js?v=NNN` and `./client-state.js?v=NNN`; a bare or hardcoded ?v=
    // here would be a DIFFERENT module instance after a version bump, so an arm
    // set on one would be invisible to the other (the b436 breakage). Derive the
    // CURRENT ?v= from capstone.js's own source so this never drifts out of
    // lockstep with a bump.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('src/net/capstone.js', ROOT), 'utf8');
    const m = src.match(/accrue\.js\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    C  = await import(mod('src/net/capstone.js'));
    CS = await import(mod('src/net/client-state.js' + v));
    R  = await import(mod('src/net/record.js' + v));
    A  = await import(mod('src/net/accrue.js' + v));
    E  = await import(mod('src/net/events.js' + v));
  } catch (e) {
    fail('could not load the capstone modules, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  const reset = () => {
    try { C.__setBlobRetired(null); } catch (e) {}
    try { CS.__setClientStateArm(null); } catch (e) {}
    try { CS.__resetClientState(); } catch (e) {}
    try { A.__clearAccrualOverride(); } catch (e) {}
  };

  try {
    // ── DORMANT (default) ───────────────────────────────────────────────────
    reset();
    if (C.BLOB_RETIRED !== false) fail('BLOB_RETIRED must ship false (DORMANT)');
    // even with the master accrual switch ON, the flag stays off until armed.
    A.setServerAccrualEnabled(true);
    if (C.isBlobRetired()) fail('DORMANT: isBlobRetired() must be false even with master accrual on');
    // clientField reads the blob byte-for-byte.
    {
      const G = { stats: { kills: 7 }, foodSlot: 'apple' };
      if (CS.clientField(G, 'foodSlot') !== 'apple') fail('DORMANT: clientField must read G[field]');
      if (CS.clientField(G, 'missing', 'fb') !== 'fb') fail('DORMANT: absent field must return fallback');
    }
    // snapshot() (events.js) still carries the residue — the blob is unchanged.
    {
      const snap = E.snapshot({ stats: { kills: 7 }, chronicle: [1], gold: 5 });
      if (!snap || !snap.stats || !snap.chronicle) fail('DORMANT: snapshot() must still include residue');
    }
    // DORMANT: applyClientState(res, G) must NOT hydrate G (byte-unchanged load).
    {
      const G = { stats: { kills: 7 } };
      CS.__resetClientState();
      CS.applyClientState({ ok: true, client_state: { stats: { kills: 999 } } }, G);
      if (G.stats.kills !== 7) fail('DORMANT: applyClientState must NOT hydrate G while dormant');
    }
    // canProceedArmed is a no-op true while dormant.
    if (C.canProceedArmed({}, {}) !== true) fail('DORMANT: canProceedArmed must be true (old path owns proceeding)');

    // ── ARMED ───────────────────────────────────────────────────────────────
    reset();
    A.setServerAccrualEnabled(true);
    C.__setBlobRetired(true);
    CS.__setClientStateArm(true);
    if (!C.isBlobRetired()) fail('ARMED: isBlobRetired() must be true (flag + master switch)');

    // FAIL-CLOSED: no envelope yet → the client must NOT proceed (online-only).
    if (C.canProceedArmed({}, {}) !== false)
      fail('ARMED: with no record and no bag, canProceedArmed must be FALSE (never author locally)');
    // a garbage envelope populates nothing → still cannot proceed.
    CS.applyClientState({ ok: false });
    CS.applyClientState(null);
    CS.applyClientState({ ok: true, client_state: 'not-an-object' });
    if (CS.isClientStateFromServer())
      fail('ARMED: a garbage envelope must not mark the bag as server-sourced');
    if (C.canProceedArmed({ _record: { version: 3 } }, {}) !== false)
      fail('ARMED: record present but NO residue bag → still cannot proceed (fail-closed)');

    // a fresh account (server said no_character) is a legitimate proceed.
    if (C.canProceedArmed({}, { noCharacter: true }) !== true)
      fail('ARMED: no_character (fresh account) must proceed clean');

    // ── HYDRATE-INTO-G: a real envelope writes residue STRAIGHT INTO G, so every
    //    existing G.<residue> read is server-truth with NO per-site routing. ──
    {
      // stale local values that MUST be overwritten by the server bag. Marks are
      // now AUTHORITY at the TOP LEVEL (G.marks, from the record path) — NOT nested
      // in bountyHunter — so hydration must leave G.marks untouched and must DROP any
      // nested marks the residue bag carries (the b443 storage migration).
      const G = {
        marks: 77,                                // authority = TOP-LEVEL (record path)
        stats: { kills: 1 }, foodSlot: 'apple',
        bountyHunter: { streak: 2 },              // residue only — no nested marks
      };
      CS.__resetClientState();
      const okFed = CS.applyClientState({
        ok: true,
        client_state: {
          stats: { kills: 999 }, foodSlot: 'steak',
          bountyHunter: { streak: 9, marks: 999999 }, // FORGED nested marks — must be dropped
          // ── FORGED AUTHORITY KEYS in the client-writable bag — must NEVER reach G ──
          gold: 1e12, gems: 50000, skills: { attack: 9e9 }, inventory: { dragon: 999 },
        },
      }, G);   // ← pass G to HYDRATE
      if (!okFed) fail('ARMED: a well-formed client_state envelope must feed + hydrate');
      // reads are plain G reads now — server truth, zero routing.
      if (G.stats.kills !== 999) fail('ARMED: G.stats must be hydrated from the server bag');
      if (G.foodSlot !== 'steak') fail('ARMED: G.foodSlot must be hydrated from the server bag');
      if (G.bountyHunter.streak !== 9) fail('ARMED: bountyHunter residue must hydrate');
      if (G.marks !== 77) fail('ARMED: top-level marks (AUTHORITY) must NOT be clobbered by residue hydration');
      // ── THE ALLOWLIST HOLDS: a forged authority key in the bag never reaches G ──
      if ('gold' in G) fail('SECURITY: forged bag `gold` must NOT hydrate into G');
      if ('gems' in G) fail('SECURITY: forged bag `gems` must NOT hydrate into G');
      if ('skills' in G) fail('SECURITY: forged bag `skills` must NOT hydrate into G');
      if ('inventory' in G) fail('SECURITY: forged bag `inventory` must NOT hydrate into G');
      if (typeof G.bountyHunter.marks !== 'undefined') fail('SECURITY: a nested bountyHunter.marks in the bag must be DROPPED by hydration, never carried into G');
      // and the fail-closed gate is satisfied once record + bag are present.
      G._record = { version: 5 };
      if (C.canProceedArmed(G, {}) !== true)
        fail('ARMED: record version + residue bag present → may proceed');
      if (!CS.isClientStateFromServer()) fail('ARMED: bag must be marked server-sourced after a good envelope');
    }

    // the residue patch (for putClientState) EXCLUDES marks and authority fields.
    {
      const G = {
        stats: { k: 1 }, chronicle: [1, 2], gold: 999, activeMonster: 'x',
        bountyHunter: { marks: 55, streak: 3 },
      };
      const patch = C.buildResiduePatch(G);
      if (!patch.stats || !patch.chronicle) fail('ARMED: residue patch must include present residue fields');
      if ('gold' in patch) fail('ARMED: residue patch must NOT include an authority field (gold)');
      if ('activeMonster' in patch) fail('ARMED: residue patch must NOT include a non-residue field');
      if (!patch.bountyHunter || patch.bountyHunter.streak !== 3)
        fail('ARMED: residue patch must include bountyHunter residue');
      if ('marks' in patch.bountyHunter)
        fail('ARMED: residue patch must EXCLUDE bountyHunter.marks (authority)');
    }
  } catch (e) {
    fail('threw mid-run: ' + (e && e.stack || e));
  } finally {
    reset();
  }

  return problems;
}

// Standalone entry.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  blobRetireGuard().then((p) => {
    if (p.length) { console.error('FAIL\n' + p.join('\n')); process.exit(1); }
    console.log('blob-retire: OK'); process.exit(0);
  });
}
