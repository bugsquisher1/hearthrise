// ============================================================================
// tests/equipment-record.mjs — THE EQUIPMENT RECORD, PROVEN BOTH WAYS.
//
// Server-side correctness of the worn set (equip.js verb → player_equipment +
// hr_state_of's top-level `equipment` projection, decoded by decodeEquipment) is
// proven elsewhere; this is the CLIENT half: that src/net/record.js +
// src/net/equipment-record.js read the worn set from the server's record under
// arm and fail-close to a SAFE EMPTY MAP — never undefined, never a forged local
// item — and that with the arm OFF nothing changes (the map is still the local
// `G.equipment`).
//
// ── THE ONE PROPERTY THIS FILE EXISTS TO PROVE ──────────────────────────────
// `Object.values(equipmentMap(G))` NEVER throws when equipment is UNKNOWN. ~74
// equipment read sites iterate/index, so a null/undefined fail-closed value would
// crash every player's boot/combat (the gold-toLocaleString / rooms-Object.values
// lockout class). The fail-closed value MUST be a real, empty, non-throwing object
// — and `equippedItem` MUST NOT return an item the server has not confirmed.
//
// Run standalone:  node tests/equipment-record.mjs
// Wired into the suite as a preflight (equipmentRecordGuard).
// ============================================================================
const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function equipmentRecordGuard() {
  const problems = [];
  const fail = (m) => problems.push('equipment-record: ' + m);

  let R, M, A;
  try {
    // ⚠ MATCH THE SPECIFIER equipment-record.js USES. Derive the CURRENT ?v= from
    // equipment-record.js's OWN source so a version bump (which walks src/ but not
    // tests/) can never split record.js into two module instances — the b436
    // breakage. Copy of rooms-record.mjs's derivation.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('src/net/equipment-record.js', ROOT), 'utf8');
    const m = src.match(/record\.js\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    R = await import(mod('src/net/record.js' + v));
    M = await import(mod('src/net/equipment-record.js'));
    A = await import(mod('src/net/accrue.js' + v));
  } catch (e) {
    fail('could not load the record modules, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  const reset = () => { try { R.__setEquipmentRecordArm(null); } catch (e) {} };
  const NOW = 1_700_000_000_000;

  // The load-bearing invariant, asserted in EVERY state below.
  const mustNotThrow = (G, label) => {
    let map;
    try { map = M.equipmentMap(G); } catch (e) { fail(label + ': equipmentMap THREW — ' + (e && e.message)); return null; }
    if (!map || typeof map !== 'object' || Array.isArray(map)) { fail(label + ': equipmentMap is not a real object (' + JSON.stringify(map) + ')'); return null; }
    try { Object.values(map); Object.keys(map); Object.entries(map); for (const _k in map) { void _k; } } catch (e) { fail(label + ': iterating equipmentMap THREW — ' + (e && e.message)); return null; }
    // equippedItem must never throw and must be a string id or null — never undefined.
    try { const v = M.equippedItem(G, 'weapon'); if (!(v === null || typeof v === 'string')) fail(label + ': equippedItem returned non-(string|null): ' + JSON.stringify(v)); }
    catch (e) { fail(label + ': equippedItem THREW — ' + (e && e.message)); }
    return map;
  };

  try {
    // ── ARM OFF (default): dormant, no regression ──────────────────────────
    reset();
    if (R.EQUIPMENT_RECORD_ARM_ENABLED !== false) fail('EQUIPMENT_RECORD_ARM_ENABLED must ship false (DORMANT)');
    if (R.isServerOfRecord('equipment')) fail('ARM OFF: `equipment` is on the active registry but the flag is off');
    {
      const G = { equipment: { weapon: 'bronze_sword', helmet: 'iron_helm' } };
      const b = M.equipmentOf(G);
      if (!b.known || b.source !== 'local') fail('ARM OFF: equipmentOf must read local G.equipment (got ' + JSON.stringify(b) + ')');
      const map = mustNotThrow(G, 'ARM OFF');
      if (map && (map.weapon !== 'bronze_sword' || map.helmet !== 'iron_helm')) fail('ARM OFF: equipmentMap must be byte-for-byte G.equipment');
      if (M.equippedItem(G, 'weapon') !== 'bronze_sword') fail('ARM OFF: equippedItem(weapon) must be bronze_sword');
      if (M.equippedItem(G, 'boots') !== null) fail('ARM OFF: equippedItem of an empty slot must be null');
      // absent / malformed local map coalesces to a KNOWN empty, like `(G.equipment||{})`.
      mustNotThrow({}, 'ARM OFF empty');
      if (M.equippedItem({}, 'weapon') !== null) fail('ARM OFF: absent equipment → equippedItem null');
      mustNotThrow({ equipment: null }, 'ARM OFF null');
      mustNotThrow({ equipment: [] }, 'ARM OFF array');
      mustNotThrow(null, 'ARM OFF no-G');
    }

    // ── ARM ON: server is the only authority ───────────────────────────────
    A.setServerAccrualEnabled(true);
    const armed = R.__setEquipmentRecordArm(true);
    if (!armed) { fail('ARM ON: could not arm (master switch not honoured?) — rest skipped'); reset(); A.setServerAccrualEnabled(false); return problems; }
    if (!R.isServerOfRecord('equipment')) fail('ARM ON: equipment not on the active registry');
    if (R.serverOfRecordFields().indexOf('equipment') === -1) fail('ARM ON: equipment must be strippable');

    // Before any envelope: UNKNOWN → SAFE EMPTY MAP, and a forged local item must NOT leak.
    {
      const G = { equipment: { weapon: 'dawn_greatsword', helmet: 'archmage_hood' } };   // forged blob values
      const b = M.equipmentOf(G);
      if (b.known) fail('ARM ON: equipment known before any envelope — a local value leaked (' + JSON.stringify(b) + ')');
      const map = mustNotThrow(G, 'ARM ON UNKNOWN');
      if (map && Object.keys(map).length !== 0) fail('ARM ON: UNKNOWN must be an EMPTY map, not the forged local one (' + JSON.stringify(map) + ')');
      if (M.equippedItem(G, 'weapon') !== null) fail('ARM ON UNKNOWN: equippedItem must be null, not the forged dawn_greatsword');
    }

    // A server envelope carrying the worn set → KNOWN from the server.
    {
      const G = {};
      const applied = R.applyRecord(G, { ok: true, version: 5, now: NOW,
        state: {}, equipment: { weapon: 'iron_sword', helmet: 'iron_helm' } });
      if (!applied.written || applied.written.indexOf('equipment') === -1)
        fail('ARM ON: applyRecord did not write equipment (' + JSON.stringify(applied) + ')');
      const b = M.equipmentOf(G);
      if (!b.known || b.source !== 'server') fail('ARM ON: equipmentOf must read the server map (got ' + JSON.stringify(b) + ')');
      const map = mustNotThrow(G, 'ARM ON server');
      if (map && (map.weapon !== 'iron_sword' || map.helmet !== 'iron_helm')) fail('ARM ON: server map wrong (' + JSON.stringify(map) + ')');
      if (M.equippedItem(G, 'weapon') !== 'iron_sword') fail('ARM ON: equippedItem(weapon) must be the server iron_sword');
      // a client overwrite of the server map is caught by the b347 fingerprint.
      G.equipment = { weapon: 'dawn_greatsword' };
      if (M.equipmentOf(G).known) fail('ARM ON: a client-overwritten G.equipment was vouched for as server truth');
      if (M.equippedItem(G, 'weapon') !== null) fail('ARM ON: a client-overwritten weapon must fail-closed to null, not the forged id');
    }

    // A server envelope with an EMPTY worn set → KNOWN-EMPTY (naked), NOT UNKNOWN.
    {
      const G = {};
      R.applyRecord(G, { ok: true, version: 6, now: NOW, state: {}, equipment: {} });
      const b = M.equipmentOf(G);
      if (!b.known) fail('ARM ON: an explicit empty worn set must be KNOWN-empty (naked), not UNKNOWN');
      const map = mustNotThrow(G, 'ARM ON known-empty');
      if (map && Object.keys(map).length !== 0) fail('ARM ON: known-empty worn set must have no items');
      if (M.equippedItem(G, 'weapon') !== null) fail('ARM ON: naked slot must be null');
    }

    // An ABSENT equipment key (malformed / pre-envelope) → UNKNOWN, fail-closed.
    {
      const G = {};
      R.applyRecord(G, { ok: true, version: 7, now: NOW, state: {} });   // no equipment key
      if (M.equipmentOf(G).known) fail('ARM ON: an absent equipment key must be UNKNOWN, not a forged empty grant');
      mustNotThrow(G, 'ARM ON absent-equipment');   // still must not throw
    }

    // A bad cell (a non-string, non-null item) condemns the whole set → UNKNOWN.
    {
      const G = {};
      R.applyRecord(G, { ok: true, version: 8, now: NOW, state: {},
        equipment: { weapon: 42 } });
      if (M.equipmentOf(G).known) fail('ARM ON: a bad cell must condemn the set to UNKNOWN');
      mustNotThrow(G, 'ARM ON bad-cell');
    }
  } finally {
    reset();
    try { A.setServerAccrualEnabled(false); } catch (e) {}
  }

  return problems;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const probs = await equipmentRecordGuard();
  if (probs.length) { console.error('FAIL:\n' + probs.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('equipment-record: dormant no-regression + armed server-read/fail-closed-empty/no-forged-item/never-throws — all green');
}
