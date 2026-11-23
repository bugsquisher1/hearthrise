// ════════════════════════════════════════════════════════════════════════
// tools/lib/danger-band.mjs — A DANGER BAND FROM LAB RUNS, AND THE PRINT OF WHAT WAS MEASURED (lane/content-pipeline, 2026-11-22).
//
// docs/design/redesign/24-content-pipeline.md section 2 (a ground on the scale). Pure: no I/O, no engine. Two readers:
//   tools/new-ground.mjs         cuts a ground's band from three v1-climb reports and pins it
//   tests/content-coherence.mjs  holds every DANGER_GROUNDS row to its pin (CC-2): a band is a measurement of the ground's own
//                                rows, so a changed pack or monster row means the band was measured on a ground that no longer exists
//
// THE CUT (src/data/danger.js BAND_RULE, the designer's, lane/band-floor 2026-11-22; R10's ref and top), the Steady mixed four
// (v1-climb.mjs base:steady), read from the held step:
//   refStep      the MID four at the band's middle Level, to the nearest rule.refTo
//   topStep      the BIS four at the ground's top Level, to the nearest rule.topTo, held to refStep + PAY.gapMax (the pay stops there too)
//   floorStep    the LOW four (a fresh company at the entry Level): its LOWEST seed's held step less rule.floorUnder, down to rule.floorTo
//                (12-targets 3.1: depth 1 is where a fresh company holds). R10 cut it as 2 x refStep - topStep, which put Muster's floor
//                160 steps over its fresh four (24-content-pipeline.md G3). THE MARGIN IS NEVER MORE THAN ONE DEPTH (lane/tuning-pass,
//                the designer, 2026-11-23; 29-tuning-pass.md, NG-3): under the amount pipeline a band is about one tier wide (27 K-6), so
//                a depth is 5 own steps, not 20, and floorUnder's 10 put a fresh four at depth 4. The margin is min(floorUnder, one depth
//                of the band it cuts), one depth = (topStep - lowest seed) / (depths - 2), so the lowest fresh seed sits at depth 2
//   refKillsHead the MID four's kills a head an hour at its held reference, to the nearest 5; omitted (PAY.refKillsHead reads) when
//                not over PAY.refKillsHead, the server's one ceiling a kill
// The floor needs the LOW cell: no band is cut without it. C-3 (12-targets: Steady dies never) is the open gate: any death in any of
// the three cells holds the ground off.
// ════════════════════════════════════════════════════════════════════════
import { createHash } from 'node:crypto';

const round = (x, to) => Math.round(x / to) * to;

/** The Steady cell of a v1-climb report (`--only base:steady`), or the first cell. */
export function steadyCell(report) {
  if (!report || !report.cells) throw new Error('not a v1-climb report (no cells)');
  const c = report.cells['base:steady'] || Object.values(report.cells)[0];
  if (!c || !c.held || !Number.isFinite(c.held.mean)) throw new Error('v1-climb report has no held step for base:steady');
  return c;
}

/** The depth (1..depths) a step sits at on a band. */
export function depthOf(step, band, depths) {
  const span = (band.topStep - band.floorStep) / (depths - 1);
  return Math.max(1, Math.min(depths, 1 + Math.round((step - band.floorStep) / span)));
}

/** The lowest held step any seed of a cell reached (its per-seed holds; the mean when a report carries none). */
export const lowestSeed = (c) => (Array.isArray(c.held.perSeed) && c.held.perSeed.length ? Math.min(...c.held.perSeed) : c.held.mean);

/** The margin under the fresh four's lowest seed (danger.js BAND_RULE floorUnder, never more than one depth of the band whose top is
    `topStep`, with `depths` depths: the lowest seed then sits at depth 2). */
export const floorMarginOf = (F, rule, topStep, depths) => (Number.isFinite(topStep) && depths > 2 && topStep > lowestSeed(F)
  ? Math.min(rule.floorUnder, (topStep - lowestSeed(F)) / (depths - 2)) : rule.floorUnder);
/** The floor a fresh company's cell gives (danger.js BAND_RULE). */
export const floorOf = (F, rule, topStep, depths) => Math.floor((lowestSeed(F) - floorMarginOf(F, rule, topStep, depths)) / rule.floorTo) * rule.floorTo;

/**
 * The band from three reports: `ref` (MID kits, middle Level), `top` (BIS kits, top Level), `floor` (LOW kits, entry Level).
 * `pay` is danger.js PAY, `depths` danger.js DEPTHS, `rule` danger.js BAND_RULE. Returns { band, verdict, notes, info, cells }.
 */
export function bandFromReports({ ref, top, floor }, pay, depths, rule, abs = null) {
  if (!floor) throw new Error('bandFromReports: no LOW cell (the floor is where a fresh company at the entry Level holds, 12-targets 3.1)');
  if (!rule || ![rule.floorUnder, rule.floorTo, rule.refTo, rule.topTo].every((x) => Number.isInteger(x) && x >= 0) || !(rule.floorTo > 0 && rule.refTo > 0 && rule.topTo > 0)) throw new Error('bandFromReports: no band rule (src/data/danger.js BAND_RULE)');
  const R = steadyCell(ref), T = steadyCell(top), F = steadyCell(floor);
  const refStep = round(R.held.mean, rule.refTo);
  const topStep = Math.min(round(T.held.mean, rule.topTo), refStep + pay.gapMax);
  const floorStep = floorOf(F, rule, topStep, depths);
  const kills = round(R.killsPerH / 4, 5);
  const band = { refStep, floorStep, topStep, ...(kills > pay.refKillsHead ? { refKillsHead: kills } : {}) };
  const notes = [], info = [];
  const deaths = [['MID', R], ['BIS', T], ['LOW', F]].filter(([, c]) => c.deaths > 0);
  for (const [k, c] of deaths) notes.push('C-3: the ' + k + ' four died ' + c.deaths + ' times at Level ' + c.L + ' (Steady must not die)');
  if (!(floorStep < refStep && refStep < topStep)) notes.push('the band is not floor < ref < top (' + floorStep + ' / ' + refStep + ' / ' + topStep + '): the LOW four holds at or over the MID four, so the Level band reads too narrow');
  else if (topStep - floorStep < depths - 1) notes.push('the band ' + floorStep + '..' + topStep + ' is under one step a depth');
  if (T.held.mean > refStep + pay.gapMax) info.push('the BIS four held ' + T.held.mean + ', past refStep + gapMax: the top is the pay cap, not the four');
  /* (own steps cut evenly: the wave-1 reading; with the absolute band the game cuts depths in absolute steps, src/core/bands.js depthAt) */
  if (!abs && floorStep < refStep && refStep < topStep) info.push('the fresh four holds depth ' + depthOf(lowestSeed(F), band, depths) + ' (its lowest seed), the MID four depth ' + depthOf(R.held.mean, band, depths) + ', ' + ((topStep - floorStep) / (depths - 1)).toFixed(1) + ' steps a depth');
  band._lowDepth = depthOf(lowestSeed(F), band, depths);
  if (abs) absoluteChecks(abs, R, notes, info);
  const verdict = deaths.length ? 'STAGED' : notes.length ? 'REVIEW' : 'OPEN';
  return { band, verdict, notes, info, cells: { ref: { L: R.L, held: R.held.mean, killsPerH: R.killsPerH, ...(R.sustain ? { sustain: R.sustain } : {}) }, top: { L: T.L, held: T.held.mean }, floor: { L: F.L, held: F.held.mean, lowest: lowestSeed(F) } } };
}

/* THE ABSOLUTE BAND'S CHECKS (lane/foundations-block; src/data/bands.js, src/core/bands.js bandAbs). The band is a FORMULA of the ground's
   entry Level, top Level and tier in absolute steps; the three cells measure where its three companies hold on the ground's own rows (the
   bridge). `abs` (absent: the wave-1 cut alone, as R10's and band-floor's evidence was read):
     band       { floorPm, refPm, topPm } the formula's band (thousandths of a Level)
     prevTopPm  the top of the scale ground one tier under this one (null: none), for 27 K-6's handover
     refLevel   the row's refLevel (27 K-5): the MID cell must be measured there, or the bridge's reference point is another company
     sustain    src/data/sustain.js SUSTAIN: the reference company's sustain shares on Steady inside their bands (04 section 3)
   Each failure is a note (REVIEW), never a silent pass. */
function absoluteChecks(abs, R, notes, info) {
  const b = abs.band, L = (pm) => (pm / 1000).toFixed(1);
  if (!b) { notes.push('no absolute band (src/core/bands.js bandAbs: the row needs entryLevel, refLevel and gearLevel, its hunt a Level band)'); return; }
  info.push('absolute band (Levels of reference strength, src/core/bands.js): floor ' + L(b.floorPm) + ', reference ' + L(b.refPm) + ', top ' + L(b.topPm));
  if (!(b.floorPm < b.refPm && b.refPm < b.topPm)) notes.push('the absolute band is not floor < reference < top (' + L(b.floorPm) + ' / ' + L(b.refPm) + ' / ' + L(b.topPm) + ')');
  if (Number.isFinite(abs.prevTopPm) && abs.prevTopPm < b.floorPm) notes.push('27 K-6: the ground a tier under tops out at ' + L(abs.prevTopPm) + ', under this floor ' + L(b.floorPm) + ': moving on would skip strength');
  if (Number.isInteger(abs.refLevel) && R.L !== abs.refLevel) notes.push('the MID cell was measured at Level ' + R.L + ', the row refLevel is ' + abs.refLevel + ' (27 K-5)');
  const S = abs.sustain, got = R.sustain;
  if (S && got) {
    for (const [k, have] of [['freePm', got.freePm], ['healerPm', got.spellPm], ['supplyPm', got.foodPm]]) {
      const [lo, hi] = S[k].band;
      if (!(have >= lo && have <= hi)) notes.push('04 section 3: the reference company ' + k + ' reads ' + have + ', its band is ' + lo + ' to ' + hi + ' (src/data/sustain.js)');
    }
    info.push('sustain at the reference: regeneration ' + got.freePm + ', heal spells ' + got.spellPm + ', food ' + got.foodPm + ' permille of ' + got.takenPmS + ' permille of max HP taken a hero-second');
  }
}

/* THE PRINT: what a band is a measurement of. The ground's route and pockets (who stands where, how many, what joins), its pull and
   respawn rules, and every monster row it can meet minus its words and its drops (a name, an icon and a loot table do not move the
   held step). A change here is a change to the ground's question, so the band must be measured again. */
const MONSTER_WORDS = new Set(['name', 'icon', 'drops', 'family', 'className', 'lore', 'desc', 'blurb']);
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined && typeof v[k] !== 'function').map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
export function packPrint(ground, monsters, monstersOn, switchOf = null) {
  if (!ground) throw new Error('packPrint: no ground row');
  const shape = {
    route: ground.route,
    pockets: ground.route.map((i) => { const p = ground.pockets[i]; return { pull: p.pull, pack: p.pack || null, spawns: p.spawns, adds: p.adds || null }; }),
    respawnMs: ground.respawnMs, pullDist: ground.pullDist, groupFit: ground.groupFit, densityMax: ground.densityMax,
    /* THE MONSTERS' SWITCH (src/data/danger.js DANGER_GROUNDS `monsters`, lane/monster-formula): a ground on the formula plays other numbers
       than its rows, so the print carries it; on its rows (or with no switch named) the print is what it always was */
    ...(switchOf === 'formula' ? { monsters: 'formula' } : {}),
  };
  const ids = [...monstersOn(ground)].sort();
  const rows = Object.fromEntries(ids.map((id) => [id, Object.fromEntries(Object.entries(monsters[id] || { missing: true }).filter(([k]) => !MONSTER_WORDS.has(k)))]));
  return createHash('sha256').update(stable({ shape, rows })).digest('hex').slice(0, 16);
}

/** The band fields a DANGER_GROUNDS row carries, compared with a pin's. */
export const BAND_KEYS = Object.freeze(['refStep', 'floorStep', 'topStep', 'refKillsHead']);
export const sameBand = (row, pin) => BAND_KEYS.every((k) => (row[k] === undefined ? null : row[k]) === (pin[k] === undefined ? null : pin[k]));

/**
 * Rewrite the band numbers on an EXISTING DANGER_GROUNDS row in danger.js's source text (the row is one line:
 * `  <id>: <wrapper>({ refStep: N, floorStep: N, topStep: N, [refKillsHead: N, ]...`, the wrapper `ground` or `Object.freeze`, whichever
 * the file uses today). Returns the new text, or null when the row is not there (a new ground's row is a design decision: its gear
 * base, drop home and Trait pool are written by hand).
 */
export function rewriteRow(src, id, band) {
  const re = new RegExp('^(  ' + id + ': [\\w.]+\\(\\{ )refStep: \\d+, floorStep: \\d+, topStep: \\d+, (?:refKillsHead: \\d+, )?', 'm');
  if (!re.test(src)) return null;
  return src.replace(re, (_, head) => head + 'refStep: ' + band.refStep + ', floorStep: ' + band.floorStep + ', topStep: ' + band.topStep + ', '
    + (band.refKillsHead !== undefined ? 'refKillsHead: ' + band.refKillsHead + ', ' : ''));
}
