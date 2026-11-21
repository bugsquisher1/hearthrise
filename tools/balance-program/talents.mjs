// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/talents.mjs — TALENTS AS THE MATRIX PLAYS THEM (docs/design/overhaul/10-level-choices.md section 8, PROVISIONAL;
// lane/c-balance-matrix). The data lives in the tools, not src/data: the game build comes later (the Coordinator 2026-11-21).
//
// THE RULE (chapter 10, 3.1 to 3.4): a hero holds floor(L / talentEvery) points; its plan spends each point on the track furthest below its
// share of the weights (ties to the first track); a track pays trackMax x talentPower x rank / (rank + talentHalf), never past its ceiling.
// TALENT POWER IS BASELINE (5.1): every harness hero carries the SUGGESTED build of its way, and the contrast builds (8.3) are variants.
//
// WHAT A CELL CAN PLAY (8.2): four stat lines through seams the engine has (the talents-hook patch plants them on the scratch copy:
// tools/balance-program/patches/talents-hook.json): Force on the permanent damage key, Footing on the hero's Defense rating, Grit on max
// health, Reserve on max mana. NOT MODELLED, never approximated: Linger's stat line (the status tick has no seam) and every unlock (the
// "when" column, the shooter rule's row and the regen condition do not exist). A way whose plan spends points on Linger spends them and
// plays nothing for them, as the cell would if the hook were missing.
//
// PURE ESM. Data and arithmetic only. Imports nothing.
// ════════════════════════════════════════════════════════════════════════

/* the six knobs of chapter 10 section 5.4 (talentUnlockSize, talentResetHours and talentFreeResetLevel move nothing a cell plays) */
export const TALENT_KNOBS = Object.freeze({ talentEvery: 5, talentHalf: 10, talentPower: 1.0, talentUnlockSize: 1.0, talentResetHours: 3, talentFreeResetLevel: 30 });
export const UNLOCK_RANKS = Object.freeze([3, 8, 15, 25, 40]);

/* the five sample tracks (8.1): id, stat, ceiling in permille, the seam a cell plays it on (null: not modelled, and why) */
export const TRACKS = Object.freeze([
  Object.freeze({ id: 'force', stat: 'damage dealt, permille on the permanent damage key', trackMax: 100, seam: 'perks.js permanentBonus("damage")' }),
  Object.freeze({ id: 'footing', stat: 'Defense rating, permille of the hero\'s own rating', trackMax: 120, seam: 'member.js heroSnapshot def' }),
  Object.freeze({ id: 'grit', stat: 'max health, permille', trackMax: 120, seam: 'member.js applyVitals maxHp' }),
  Object.freeze({ id: 'reserve', stat: 'max mana, permille', trackMax: 150, seam: 'member.js applyVitals maxMana' }),
  Object.freeze({ id: 'linger', stat: 'status tick, permille', trackMax: 100, seam: null, notModelled: 'the status tick has no engine seam (the census lists it as an unnamed number); chapter 10 section 8.2' }),
]);
export const TRACK_IDS = Object.freeze(TRACKS.map((t) => t.id));
export const MODELLED = Object.freeze(TRACKS.filter((t) => t.seam).map((t) => t.id));

/* the suggested weights by harness way (8.1), in TRACK_IDS order: force, footing, grit, reserve, linger */
export const SUGGESTED = Object.freeze({
  tank: Object.freeze([1, 2, 2, 0, 0]), sword: Object.freeze([3, 1, 1, 0, 0]), hammer: Object.freeze([3, 1, 1, 0, 0]), axes: Object.freeze([2, 0, 1, 0, 2]),
  bow: Object.freeze([3, 0, 1, 1, 0]), crossbow: Object.freeze([3, 0, 1, 1, 0]), mage: Object.freeze([3, 0, 1, 1, 0]), healer: Object.freeze([0, 1, 2, 2, 0]),
});

/* THE CONTRAST BUILDS (8.3): a build gives each seat its weights. A: every point in Force. B: the hammer with the tank's weights (the built
   holder; every other seat suggested). C: no points spent. D: every hero on Footing and Grit. */
export const BUILDS = Object.freeze({
  S: Object.freeze({ id: 'S', label: 'suggested', weightsOf: (way) => SUGGESTED[way] }),
  A: Object.freeze({ id: 'A', label: 'all Force', weightsOf: () => [1, 0, 0, 0, 0] }),
  B: Object.freeze({ id: 'B', label: 'the built holder (a hammer on the tank\'s weights)', weightsOf: (way) => (way === 'hammer' ? SUGGESTED.tank : SUGGESTED[way]) }),
  C: Object.freeze({ id: 'C', label: 'empty (no points spent)', weightsOf: () => [0, 0, 0, 0, 0] }),
  D: Object.freeze({ id: 'D', label: 'all safety (Footing and Grit)', weightsOf: () => [0, 1, 1, 0, 0] }),
});

/** Points a hero holds at Level L. */
export const pointsAt = (L, k = TALENT_KNOBS) => Math.max(0, Math.floor(L / k.talentEvery));

/** The plan rule (3.4): each point to the track furthest below its share of the weights, ties to the first. Answers ranks in TRACK_IDS order. */
export function allocate(points, weights) {
  const w = weights.map((x) => Math.max(0, Number(x) || 0)), W = w.reduce((a, b) => a + b, 0), ranks = w.map(() => 0);
  if (!(W > 0)) return ranks;
  for (let k = 1; k <= points; k++) {
    let best = -1, gap = -Infinity;
    w.forEach((x, i) => { if (x <= 0) return; const g = (x / W) * k - ranks[i]; if (g > gap + 1e-12) { gap = g; best = i; } });
    ranks[best]++;
  }
  return ranks;
}

/** What a track pays at a rank, in permille (3.2): the flattening curve, never past the ceiling. */
export const valueAt = (track, rank, k = TALENT_KNOBS) => (rank > 0 ? (track.trackMax * k.talentPower * rank) / (rank + k.talentHalf) : 0);

/** A seat's stat lines at Level L under a build: { force, footing, grit, reserve } in permille (Linger and the unlocks are not modelled). */
export function talentsOf(way, L, build = 'S', k = TALENT_KNOBS) {
  const b = BUILDS[build];
  if (!b) throw new Error('talents: no build ' + build);
  const weights = b.weightsOf(way);
  if (!weights) throw new Error('talents: no suggested weights for way ' + way);
  const ranks = allocate(pointsAt(L, k), weights), out = {};
  TRACKS.forEach((t, i) => { if (t.seam) out[t.id] = Math.round(valueAt(t, ranks[i], k) * 10) / 10; });
  return { pm: out, ranks: Object.fromEntries(TRACK_IDS.map((id, i) => [id, ranks[i]])), unplayed: TRACKS.filter((t, i) => !t.seam && ranks[i] > 0).map((t) => t.id) };
}
