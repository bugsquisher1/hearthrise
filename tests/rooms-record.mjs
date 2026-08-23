// ============================================================================
// tests/rooms-record.mjs — THE ROOMS RECORD, PROVEN BOTH WAYS.
//
// Server-side correctness of the room rung (hr_unlock_buy `room:<id>` +
// hr_state_of's `progress` projection, shaped by pickRooms) is proven elsewhere;
// this is the CLIENT half: that src/net/record.js + src/net/rooms-record.js read
// the room map from the server's record under arm and fail-close to a SAFE EMPTY
// MAP — never undefined, never a forged local rung — and that with the arm OFF
// nothing changes (the map is still the local `G.rooms`).
//
// ── THE ONE PROPERTY THIS FILE EXISTS TO PROVE ──────────────────────────────
// `Object.values(roomsMap(G))` NEVER throws when rooms is UNKNOWN. A room read
// iterates, so a null/undefined fail-closed value would crash every player's
// boot (the gold-toLocaleString lockout class). The fail-closed value MUST be a
// real, empty, non-throwing object — and MUST NOT grant a room the server has
// not confirmed.
//
// Run standalone:  node tests/rooms-record.mjs
// Wired into the suite as a preflight (roomsRecordGuard).
// ============================================================================
const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function roomsRecordGuard() {
  const problems = [];
  const fail = (m) => problems.push('rooms-record: ' + m);

  let R, M, A;
  try {
    // ⚠ MATCH THE SPECIFIER rooms-record.js USES. Derive the CURRENT ?v= from
    // rooms-record.js's OWN source so a version bump (which walks src/ but not
    // tests/) can never split record.js into two module instances — the b436
    // breakage. Copy of rested-record.mjs's derivation.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('src/net/rooms-record.js', ROOT), 'utf8');
    const m = src.match(/record\.js\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    R = await import(mod('src/net/record.js' + v));
    M = await import(mod('src/net/rooms-record.js'));
    A = await import(mod('src/net/accrue.js' + v));
  } catch (e) {
    fail('could not load the record modules, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  const reset = () => { try { R.__setRoomsRecordArm(null); } catch (e) {} };
  const NOW = 1_700_000_000_000;

  // The load-bearing invariant, asserted in EVERY state below.
  const mustNotThrow = (G, label) => {
    let map;
    try { map = M.roomsMap(G); } catch (e) { fail(label + ': roomsMap THREW — ' + (e && e.message)); return null; }
    if (!map || typeof map !== 'object' || Array.isArray(map)) { fail(label + ': roomsMap is not a real object (' + JSON.stringify(map) + ')'); return null; }
    try { Object.values(map); } catch (e) { fail(label + ': Object.values(roomsMap) THREW — ' + (e && e.message)); return null; }
    return map;
  };

  try {
    /* ── b456: THE SHIPPED DEFAULT IS ARMED, so the const assertion inverts and
       the dormant block is no longer reachable via `reset()`. Both positions are
       still held: the ARM is the contract (a revert re-opens a forgeable,
       client-authored value), and the dormant fall-through is the kill-switch
       position, driven explicitly through the seam rather than assumed. */
    reset();
    if (R.ROOMS_RECORD_ARM_ENABLED !== true) fail('ROOMS_RECORD_ARM_ENABLED must ship true (ARMED) — a revert '
      + 'puts the house room rungs (and the noBurn they produce) back under client authority');

    // ── ARM OFF (seam-forced): dormant, no regression ──────────────────────
    R.__setRoomsRecordArm(false);
    if (R.isServerOfRecord('rooms')) fail('ARM OFF: `rooms` is on the active registry but the flag is off');
    {
      const G = { rooms: { kitchen: 3, forge: 1 } };
      const b = M.roomsOf(G);
      if (!b.known || b.source !== 'local') fail('ARM OFF: roomsOf must read local G.rooms (got ' + JSON.stringify(b) + ')');
      const map = mustNotThrow(G, 'ARM OFF');
      if (map && (map.kitchen !== 3 || map.forge !== 1)) fail('ARM OFF: roomsMap must be byte-for-byte G.rooms');
      if (M.roomRung(G, 'kitchen') !== 3) fail('ARM OFF: roomRung(kitchen) must be 3');
      if (M.roomRung(G, 'nope') !== 0) fail('ARM OFF: roomRung of an unowned room must be 0');
      if (M.roomOwned(G, 'kitchen') !== true || M.roomOwned(G, 'nope') !== false) fail('ARM OFF: roomOwned wrong');
      // absent / malformed local map coalesces to a KNOWN empty, like `(G.rooms||{})`.
      mustNotThrow({}, 'ARM OFF empty');
      if (M.roomRung({}, 'kitchen') !== 0) fail('ARM OFF: absent rooms → rung 0');
      mustNotThrow({ rooms: null }, 'ARM OFF null');
      mustNotThrow(null, 'ARM OFF no-G');
    }

    // ── ARM ON: server is the only authority ───────────────────────────────
    A.setServerAccrualEnabled(true);
    const armed = R.__setRoomsRecordArm(true);
    if (!armed) { fail('ARM ON: could not arm (master switch not honoured?) — rest skipped'); reset(); A.setServerAccrualEnabled(false); return problems; }
    if (!R.isServerOfRecord('rooms')) fail('ARM ON: rooms not on the active registry');
    if (R.serverOfRecordFields().indexOf('rooms') === -1) fail('ARM ON: rooms must be strippable');

    // Before any envelope: UNKNOWN → SAFE EMPTY MAP, and a forged local rung must NOT leak.
    {
      const G = { rooms: { kitchen: 5, forge: 9 } };   // forged blob values
      const b = M.roomsOf(G);
      if (b.known) fail('ARM ON: rooms known before any envelope — a local value leaked (' + JSON.stringify(b) + ')');
      const map = mustNotThrow(G, 'ARM ON UNKNOWN');
      if (map && Object.keys(map).length !== 0) fail('ARM ON: UNKNOWN must be an EMPTY map, not the forged local one (' + JSON.stringify(map) + ')');
      if (M.roomRung(G, 'kitchen') !== 0) fail('ARM ON UNKNOWN: roomRung must be 0, not the forged 5');
      if (M.roomOwned(G, 'kitchen') !== false) fail('ARM ON UNKNOWN: roomOwned must be false (fail-closed)');
    }

    // A server envelope carrying the room progress rows → KNOWN from the server.
    {
      const G = {};
      const applied = R.applyRecord(G, { ok: true, version: 5, now: NOW,
        state: {}, progress: [
          { kind: 'unlock', key: 'room:kitchen', value: 3 },
          { kind: 'unlock', key: 'room:forge', value: 2 },
          { kind: 'unlock', key: 'skill:cooking', value: 1 },   // not a room → ignored
        ] });
      if (!applied.written || applied.written.indexOf('rooms') === -1)
        fail('ARM ON: applyRecord did not write rooms (' + JSON.stringify(applied) + ')');
      const b = M.roomsOf(G);
      if (!b.known || b.source !== 'server') fail('ARM ON: roomsOf must read the server map (got ' + JSON.stringify(b) + ')');
      const map = mustNotThrow(G, 'ARM ON server');
      if (map && (map.kitchen !== 3 || map.forge !== 2)) fail('ARM ON: server map wrong (' + JSON.stringify(map) + ')');
      if (map && 'cooking' in map) fail('ARM ON: a non-room progress row leaked into the map');
      if (M.roomRung(G, 'kitchen') !== 3) fail('ARM ON: roomRung(kitchen) must be the server 3');
      if (M.roomOwned(G, 'forge') !== true) fail('ARM ON: roomOwned(forge) must be true');
      // a client overwrite of the server map is caught by the b347 fingerprint.
      G.rooms = { kitchen: 99 };
      if (M.roomsOf(G).known) fail('ARM ON: a client-overwritten G.rooms was vouched for as server truth');
    }

    // A PRESENT progress array with no room rows → KNOWN-EMPTY ("owns no rooms yet").
    {
      const G = {};
      R.applyRecord(G, { ok: true, version: 6, now: NOW, state: {},
        progress: [{ kind: 'unlock', key: 'skill:cooking', value: 1 }] });
      const b = M.roomsOf(G);
      if (!b.known) fail('ARM ON: a present progress array with no rooms must be KNOWN-empty, not UNKNOWN');
      const map = mustNotThrow(G, 'ARM ON known-empty');
      if (map && Object.keys(map).length !== 0) fail('ARM ON: known-empty map must have no rooms');
    }

    // An ABSENT progress array (malformed / pre-envelope) → UNKNOWN, fail-closed.
    {
      const G = {};
      R.applyRecord(G, { ok: true, version: 7, now: NOW, state: {} });  // no progress key
      if (M.roomsOf(G).known) fail('ARM ON: an absent progress array must be UNKNOWN, not a forged empty grant');
      mustNotThrow(G, 'ARM ON absent-progress');   // still must not throw
    }

    // A bad rung (negative / non-finite) condemns the whole map → UNKNOWN.
    {
      const G = {};
      R.applyRecord(G, { ok: true, version: 8, now: NOW, state: {},
        progress: [{ kind: 'unlock', key: 'room:kitchen', value: -4 }] });
      if (M.roomsOf(G).known) fail('ARM ON: a negative rung must condemn the map to UNKNOWN');
      mustNotThrow(G, 'ARM ON bad-rung');
    }
  } finally {
    reset();
    try { A.setServerAccrualEnabled(false); } catch (e) {}
  }

  return problems;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const probs = await roomsRecordGuard();
  if (probs.length) { console.error('FAIL:\n' + probs.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('rooms-record: dormant no-regression + armed server-read/fail-closed-empty/no-forged-room/never-throws — all green');
}
