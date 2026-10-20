// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-tuning.js — THE HUNT WORLD'S NUMBERS (HUNT_SCREEN_SPEC §1.2)
//
// World numbers only. Role numbers (peel chance, spot hysteresis, Challenge
// radius) live in hunt-roles.js; lane seconds in consumables.js/abilities.js;
// bleed in statuses.js. One data file per owning lane (spec §1.6).
//
// UNITS. Every clock is integer ms. Every distance the engine persists is an
// integer: a tile, or MILLITILES (1000 = one tile) for progress along a step.
// A path step costs STEP_COST.straight or STEP_COST.diagonal (1414 ≈ 1000·√2),
// so A* and movement never compare floats.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const HUNT_TUNING = Object.freeze({
  /* One sub-step. A swing (COMBAT_BALANCE.tickMs, the one basic-attack interval) is a
     whole number of them (engine contract #2; world-step.substepsOf refuses one that is not). */
  stepMs: 100,
  /* Path step costs in millitiles; also the length of a straight / diagonal move. */
  stepCost: Object.freeze({ straight: 1000, diagonal: 1414 }),
  /* A* stops after this many expanded nodes and answers "no path" (GR-03). */
  pathNodeCap: 4000,
  /* A unit blocked this long on its next tile re-plans around the blocker (MV-05). */
  blockedRepathMs: 500,
  /* While re-planning around a blocker, occupied tiles this close (Chebyshev) are avoided. */
  blockedAvoidRadius: 3,
  /* The leader's trail: the last trailLen tiles; follower i aims trailSpacing·(i+1) back (MV-08/09). */
  trailLen: 40,
  trailSpacing: 2,
  /* A follower re-aims at its trail slot at most this often (MV-10). */
  followRepathMs: 600,
  /* Tiles a pack may step past its room's edge, for a ground whose row states no
     `leashMargin` of its own (spec §3.1 #5, ASSUMED 1 tile; LE-08: a later ground may
     state a longer one to chain packs). Resolved once, in hunt-grounds.js leashMarginOf. */
  leashMarginDefault: 1,
  /* Out of combat a hero regains this many permille of max HP per second (ASSUMED 6%). */
  oocRegenPermillePerS: 60,
  /* A corpse lingers this long, then is removed (PC-16). */
  corpseMs: 10000,
  /* After a pull the party waits at least this long, and until every hero is within
     regroupRadius tiles (Chebyshev) of the leader (spec §3.2 #18). */
  regroupMs: 1500,
  regroupRadius: 7,
  /* hunt_instances.world may not exceed this many UTF-8 bytes (engine contract #4, ASSUMED). */
  worldMaxBytes: 16384,
  /* THE LIVE LOOK-AHEAD (Tyler 2026-10-20): a settle answer seeds the viewer's browser with this many
     combat swings (16 x the 2 s swing = 32 s, two server commits), never more. The edge's hunt_live
     (hunt-settle.js liveSeeds) and the browser's live engine read it; a leave / change / kick lands no
     earlier than the last of them (2026-10-31-live-horizon.sql c_horizon_ms = liveSeeds x tickMs,
     pinned by tests/hunt-live.mjs LV-H). */
  liveSeeds: 16,
});

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const T = HUNT_TUNING;
  const posInt = (k, v) => { if (!Number.isInteger(v) || v <= 0) out.push(k + ' must be a positive integer, got ' + v); };
  for (const k of ['stepMs', 'pathNodeCap', 'blockedRepathMs', 'blockedAvoidRadius', 'trailLen',
    'trailSpacing', 'followRepathMs', 'oocRegenPermillePerS', 'corpseMs', 'regroupMs', 'regroupRadius', 'worldMaxBytes', 'liveSeeds']) posInt(k, T[k]);
  posInt('stepCost.straight', T.stepCost.straight);
  posInt('stepCost.diagonal', T.stepCost.diagonal);
  if (!Number.isInteger(T.leashMarginDefault) || T.leashMarginDefault < 0) out.push('leashMarginDefault must be an integer >= 0');
  for (const k of ['blockedRepathMs', 'followRepathMs', 'corpseMs', 'regroupMs']) {
    if (T[k] % T.stepMs !== 0) out.push(k + ' is not a whole number of sub-steps');
  }
  return out;
}
