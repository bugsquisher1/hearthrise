// ════════════════════════════════════════════════════════════════════════
// tools/lib/danger-band.mjs — A DANGER BAND FROM LAB RUNS, AND THE PRINT OF WHAT WAS MEASURED (lane/content-pipeline, 2026-11-22).
//
// docs/design/redesign/24-content-pipeline.md section 2 (a ground on the scale). Pure: no I/O, no engine. Two readers:
//   tools/new-ground.mjs         cuts a ground's band from three v1-climb reports and pins it
//   tests/content-coherence.mjs  holds every DANGER_GROUNDS row to its pin (CC-2): a band is a measurement of the ground's own
//                                rows, so a changed pack or monster row means the band was measured on a ground that no longer exists
//
// THE CUT (R10's, lane/r10-more-grounds, 2026-11-22; src/data/danger.js DANGER_GROUNDS "THE BANDS PAST MUSTER, MEASURED"), the
// Steady mixed four (v1-climb.mjs base:steady), read from the held step:
//   refStep      the MID four at the band's middle Level, to the nearest 10
//   topStep      the BIS four at the ground's top Level, to the nearest 5, held to refStep + PAY.gapMax (the pay stops there too)
//   floorStep    as far under refStep as the top is over (2 x refStep - topStep)
//   refKillsHead the MID four's kills a head an hour at its held reference, to the nearest 5; omitted (PAY.refKillsHead reads) when
//                not over PAY.refKillsHead, the server's one ceiling a kill
// The LOW four (a fresh company at the entry Level) is read, not cut: it must hold near depth 1 (12-targets 3.1), so its depth is
// reported. C-3 (12-targets: Steady dies never) is the open gate: any death in any of the three cells holds the ground off.
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

/**
 * The band from three reports: `ref` (MID kits, middle Level), `top` (BIS kits, top Level), `floor` (LOW kits, entry Level; optional).
 * `pay` is danger.js PAY, `depths` danger.js DEPTHS. Returns { band, verdict, notes }.
 */
export function bandFromReports({ ref, top, floor }, pay, depths) {
  const R = steadyCell(ref), T = steadyCell(top), F = floor ? steadyCell(floor) : null;
  const refStep = round(R.held.mean, 10);
  const topStep = Math.min(round(T.held.mean, 5), refStep + pay.gapMax);
  const floorStep = 2 * refStep - topStep;
  const kills = round(R.killsPerH / 4, 5);
  const band = { refStep, floorStep, topStep, ...(kills > pay.refKillsHead ? { refKillsHead: kills } : {}) };
  const notes = [], info = [];
  const deaths = [['MID', R], ['BIS', T], ...(F ? [['LOW', F]] : [])].filter(([, c]) => c.deaths > 0);
  for (const [k, c] of deaths) notes.push('C-3: the ' + k + ' four died ' + c.deaths + ' times at Level ' + c.L + ' (Steady must not die)');
  if (!(floorStep < refStep && refStep < topStep)) notes.push('the band is not floor < ref < top (' + floorStep + ' / ' + refStep + ' / ' + topStep + ')');
  if (T.held.mean > refStep + pay.gapMax) info.push('the BIS four held ' + T.held.mean + ', past refStep + gapMax: the top is the pay cap, not the four');
  if (F) {
    const d = depthOf(F.held.mean, band, depths);
    if (d > 3) notes.push('the LOW four holds depth ' + d + ': a fresh company should open at depth 1 to 3 (12-targets 3.1)');
    const span = (topStep - floorStep) / (depths - 1);
    if (F.held.mean < floorStep - span) notes.push('the LOW four holds ' + F.held.mean + ', more than a depth under the floor ' + floorStep + ': a fresh company cannot hold depth 1 (12-targets 3.1)');
    band._lowDepth = d;
  }
  const verdict = deaths.length ? 'STAGED' : notes.length ? 'REVIEW' : 'OPEN';
  return { band, verdict, notes, info, cells: { ref: { L: R.L, held: R.held.mean, killsPerH: R.killsPerH }, top: { L: T.L, held: T.held.mean }, ...(F ? { floor: { L: F.L, held: F.held.mean } } : {}) } };
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
