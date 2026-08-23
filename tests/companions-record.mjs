// ============================================================================
// tests/companions-record.mjs — THE COMPANION ROSTER, RECONSTRUCTED (both ways).
//
// Server-side correctness of the hr_state_of companions projection is proven by
// the §2 self-check inside 2026-08-22-companion-record.sql (it runs on every
// apply: fresh reads null/[]/{}, equipped from the column, the whole owned set
// with fox excluded, per-id XP for every owned companion). This is the CLIENT
// half — the CRITICAL blocker: under the blob-retire arm the client stops loading
// the save blob, so accrue.js reconcileCompanions MUST rebuild G.companions from
// the envelope, and ensureCompanionState MUST fail-closed (never a fox-reset)
// until it arrives.
//
// PROVES:
//   1. DORMANT — reconcileCompanions is a no-op; the client roster is untouched
//      and ensureState/getCompanionBonus keep seeding fox exactly as today.
//   2. ARMED   — reconcileCompanions rebuilds {ownedIds, xp, equipped} from the
//      envelope (owned ∪ fox, per-id xp, equipped), NOT reset to fox.
//   3. ARMED, BEFORE THE ENVELOPE — reconcileCompanions is fail-closed (an absent
//      res.companions leaves the roster alone) and ensureState seeds an EMPTY
//      roster, never fox — a boot before the envelope shows "no companions yet",
//      never a reset that could persist.
//   4. EQUIPPED SAFETY — an equipped id the player does not (server-)own is
//      refused to null.
//   5. XP-AWARD GATE — awardCompanionXp no-ops under arm (server owns companion XP).
//
// Run standalone:  node tests/companions-record.mjs
// Wired into the suite as a preflight (companionsRecordGuard).
// ============================================================================
const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function companionsRecordGuard() {
  const problems = [];
  const fail = (m) => problems.push('companions-record: ' + m);

  // ⚠ DERIVE THE ?v= FROM THE READER MODULE'S OWN SOURCE (accrue.js) at runtime.
  // A version bump walks src/ but not tests/, so a hardcoded specifier would split
  // accrue.js into two module instances (the b436 breakage). Never hardcode it.
  // A togglable capstone arm on the window global — companionAuthorityArmed() and
  // companions.js blobRetired() both read it at call time. Set BEFORE the imports:
  // companions.js touches `window` at module-evaluation time.
  const savedWindow = globalThis.window;
  let armed = false;
  globalThis.window = {
    G: {},
    HearthriseCapstone: { isBlobRetired: () => armed },
  };
  const setArm = (on) => { armed = !!on; };

  let A, C;
  try {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('src/net/accrue.js', ROOT), 'utf8');
    const m = src.match(/\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    A = await import(mod('src/net/accrue.js' + v));
    C = await import(mod('src/features/companions.js' + v));
  } catch (e) {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    fail('could not load accrue.js / companions.js, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  if (typeof A.reconcileCompanions !== 'function') {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    fail('accrue.js must publish reconcileCompanions');
    return problems;
  }

  // A representative envelope (the shape hr_state_of now emits). raccoon+sparrow
  // owned, raccoon equipped, both with XP; fox is NOT in `owned` (grammar-owned).
  const ENV = () => ({
    ok: true, version: 5,
    companions: { equipped: 'raccoon', owned: ['raccoon', 'sparrow'], xp: { raccoon: 5000, sparrow: 120 } },
  });

  try {
    // ── 1. DORMANT: reconcileCompanions is a pure no-op ─────────────────────
    setArm(false);
    {
      const G = { companions: { ownedIds: ['fox'], xp: { fox: 42 }, equipped: 'fox' } };
      const r = A.reconcileCompanions(G, ENV());
      if (!r || r.mode !== 'dormant') fail('DORMANT: reconcileCompanions must return {mode:dormant} (got ' + JSON.stringify(r) + ')');
      if (G.companions.equipped !== 'fox' || G.companions.xp.fox !== 42 || G.companions.ownedIds.length !== 1)
        fail('DORMANT: reconcileCompanions altered the client roster');
    }
    // DORMANT ensureState (via getCompanionBonus) keeps seeding fox exactly as today.
    if (typeof C.getCompanionBonus === 'function') {
      globalThis.window.G = { equipment: {} };
      C.getCompanionBonus();
      const comp = globalThis.window.G.companions;
      if (!comp || !Array.isArray(comp.ownedIds) || comp.ownedIds.indexOf('fox') === -1)
        fail('DORMANT: ensureState must still seed the starter fox (got ' + JSON.stringify(comp) + ')');
    }

    // ── 2. ARMED: rebuild from the envelope, NOT reset to fox ────────────────
    setArm(true);
    {
      // A pre-existing FORGED local roster (what a stale blob might hold) must be
      // REPLACED by server truth, not merged.
      const G = { companions: { ownedIds: ['fox', 'dragon'], xp: { fox: 999999 }, equipped: 'dragon' } };
      const r = A.reconcileCompanions(G, ENV());
      if (!r || r.mode !== 'server') fail('ARMED: reconcileCompanions must return {mode:server} (got ' + JSON.stringify(r) + ')');
      const c = G.companions;
      // owned = server set ∪ fox
      const owned = new Set(c.ownedIds);
      if (!owned.has('raccoon') || !owned.has('sparrow') || !owned.has('fox'))
        fail('ARMED: ownedIds must be raccoon+sparrow ∪ fox (got ' + JSON.stringify(c.ownedIds) + ')');
      if (owned.has('dragon')) fail('ARMED: the forged local `dragon` survived — roster was merged, not replaced');
      if (c.ownedIds.length !== 3) fail('ARMED: ownedIds should be exactly 3 (got ' + c.ownedIds.length + ')');
      // per-id xp, fox defaulting to 0
      if (c.xp.raccoon !== 5000 || c.xp.sparrow !== 120) fail('ARMED: per-id xp not restored (got ' + JSON.stringify(c.xp) + ')');
      if (c.xp.fox !== 0) fail('ARMED: fox xp must default to a KNOWN 0 (got ' + c.xp.fox + ')');
      if (c.xp.raccoon === undefined) fail('ARMED: raccoon xp missing');
      // the forged 999999 must be GONE
      if (c.xp.fox === 999999) fail('ARMED: a forged local xp survived the rebuild');
      // equipped from the server
      if (c.equipped !== 'raccoon') fail('ARMED: equipped not restored to raccoon (got ' + c.equipped + ')');
    }

    // ── 3. ARMED, BEFORE THE ENVELOPE: fail-closed ──────────────────────────
    {
      // (a) reconcileCompanions with NO res.companions leaves the roster untouched.
      const G = { companions: { ownedIds: ['fox', 'raccoon'], xp: { raccoon: 5000 }, equipped: 'raccoon' } };
      const r = A.reconcileCompanions(G, { ok: true, version: 6 });   // no companions key
      if (!r || r.mode !== 'absent') fail('ARMED/absent: must return {mode:absent} (got ' + JSON.stringify(r) + ')');
      if (G.companions.ownedIds.indexOf('raccoon') === -1 || G.companions.equipped !== 'raccoon')
        fail('ARMED/absent: an un-projecting envelope WIPED the roster — must leave it untouched');
    }
    // (b) ensureState under arm, before any envelope, seeds an EMPTY roster — NEVER fox.
    if (typeof C.getCompanionBonus === 'function') {
      globalThis.window.G = { equipment: { companion: 'fox_companion' } };   // even with a fox equip pointer…
      const bonus = C.getCompanionBonus();
      const comp = globalThis.window.G.companions;
      if (!comp) fail('ARMED/pre-envelope: ensureState must seed an (empty) roster object');
      else if (comp.ownedIds.length !== 0 || comp.equipped !== null)
        fail('ARMED/pre-envelope: ensureState seeded a NON-empty roster — a fox-reset leaked (' + JSON.stringify(comp) + ')');
      // …and the bonus is a safe zero, never a fox bonus.
      if (bonus && Object.values(bonus).some((x) => x !== 0))
        fail('ARMED/pre-envelope: getCompanionBonus returned a non-zero bonus with no server roster');
    }

    // ── 4. EQUIPPED SAFETY: an un-owned equipped id is refused to null ───────
    setArm(true);
    {
      const G = {};
      A.reconcileCompanions(G, { companions: { equipped: 'griffin', owned: ['raccoon'], xp: {} } });
      if (G.companions.equipped !== null) fail('EQUIP-SAFETY: an equipped id not in owned must null out (got ' + G.companions.equipped + ')');
      if (G.companions.ownedIds.indexOf('raccoon') === -1) fail('EQUIP-SAFETY: owned roster lost');
    }

    // ── 5. XP-AWARD GATE: awardCompanionXp no-ops under arm ──────────────────
    if (typeof C.awardCompanionXp === 'function') {
      setArm(true);
      globalThis.window.G = { companions: { ownedIds: ['fox', 'raccoon'], xp: { raccoon: 100 }, equipped: 'raccoon' } };
      C.awardCompanionXp(500);
      if (globalThis.window.G.companions.xp.raccoon !== 100)
        fail('XP-GATE: awardCompanionXp wrote XP under arm — the server owns companion XP (got ' + globalThis.window.G.companions.xp.raccoon + ')');
      // …and DORMANT it still awards (no regression).
      setArm(false);
      globalThis.window.G = { companions: { ownedIds: ['fox', 'raccoon'], xp: { raccoon: 100 }, equipped: 'raccoon' }, equipment: {} };
      C.awardCompanionXp(5);
      if (globalThis.window.G.companions.xp.raccoon <= 100)
        fail('XP-GATE: DORMANT awardCompanionXp must still award (regression)');
    }

    // ── 6. SERVER-GRANT TRANSPORT: a NON-SHOP unlock writes the server row ────
    // Under the capstone arm, unlockCompanion for a non-shop companion must ALSO
    // fire hr_companion_grant (via HearthriseGoalClaim.grantCompanion) so the
    // server owned-set — the thing reconcileCompanions rebuilds from — carries the
    // acquisition and it SURVIVES the next reload. Dormant: no call (byte-unchanged).
    // Shop + starter: skipped (shop gets its row from hr_unlock_buy; fox is grammar).
    if (typeof C.unlockCompanion === 'function') {
      const calls = [];
      globalThis.window.HearthriseGoalClaim = {
        grantCompanion: (id, source) => { calls.push({ id, source }); return { catch() {} }; },
      };

      // (a) DORMANT: a non-shop unlock fires NO server grant (byte-unchanged).
      setArm(false);
      calls.length = 0;
      globalThis.window.G = { companions: { ownedIds: ['fox'], xp: { fox: 0 }, equipped: 'fox' } };
      C.unlockCompanion('wolf_pup');                     // drop:small_wolf — non-shop
      if (calls.length !== 0) fail('GRANT: DORMANT must NOT fire a server grant (got ' + JSON.stringify(calls) + ')');
      if (globalThis.window.G.companions.ownedIds.indexOf('wolf_pup') === -1)
        fail('GRANT: DORMANT unlockCompanion must still write the local ownedIds (byte-unchanged)');

      // (b) ARMED: a non-shop unlock fires exactly one grant, carrying id + source.
      setArm(true);
      calls.length = 0;
      globalThis.window.G = { companions: { ownedIds: [], xp: {}, equipped: null } };
      C.unlockCompanion('wolf_pup');
      if (calls.length !== 1 || calls[0].id !== 'wolf_pup')
        fail('GRANT: ARMED non-shop unlock must fire grantCompanion(wolf_pup, …) exactly once (got ' + JSON.stringify(calls) + ')');
      if (!/^drop:/.test(String(calls[0].source || '')))
        fail('GRANT: ARMED grant must carry the authored source (got ' + JSON.stringify(calls[0]) + ')');

      // (c) ARMED: a SHOP companion is skipped (it gets its row from hr_unlock_buy).
      calls.length = 0;
      globalThis.window.G = { companions: { ownedIds: [], xp: {}, equipped: null } };
      C.unlockCompanion('raccoon');                      // shop:25000
      if (calls.length !== 0) fail('GRANT: ARMED shop companion must NOT fire the grant (got ' + JSON.stringify(calls) + ')');

      // (d) ARMED: the starter fox is skipped (owned by grammar, no row).
      calls.length = 0;
      globalThis.window.G = { companions: { ownedIds: [], xp: {}, equipped: null } };
      C.unlockCompanion('fox');
      if (calls.length !== 0) fail('GRANT: ARMED starter fox must NOT fire the grant (got ' + JSON.stringify(calls) + ')');

      delete globalThis.window.HearthriseGoalClaim;
    }
  } finally {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
  }

  return problems;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const probs = await companionsRecordGuard();
  if (probs.length) { console.error('FAIL:\n' + probs.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('companions-record: dormant no-op + armed rebuild + fail-closed-pre-envelope + equip-safety + xp-gate — all green');
}
