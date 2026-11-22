// tools/balance-lab/v3/lab-v3.mjs — BALANCE LAB v3'S ENGINE SIDE: the balance matrix's own cells, played live on the bundled engine with the
// global knobs of tools/balance-program/formulas/knobs.json (lane/c-balance-matrix, 40-formula-brief sections 5-7).
//
// tools/balance-lab/build.mjs --v3 bundles this file's graph into v3/dist/worker.js with every knob's numbers read from the knob settings the
// bundle is CREATED with (knob-rules.mjs knobValue, the same rounding the matrix's scratch copy writes), so one created lab is one setting of
// every knob. The page creates a fresh worker per setting. What a cell plays is what tools/balance-sim/cell.mjs would field (its resolveOnly
// answer, made at build time): the same kits, skills, bars, bags, pulls, rungs and projected rows. tools/balance-lab/parity.mjs holds the
// three sides equal: a resolved cell here plays what cell.mjs plays, a knob here moves what the scratch copy moves, and the formula's rows
// re-written here are matrix-regen.mjs's.
//
//   start(knobs)     once, after create: the monster rows re-written from the formula when a knob the rows are written from moved
//   play(cell)       { metrics, seats, hours } for one live cell: { resolved, whatIf, hours, seedBase }
//   handle(msg, post)  the worker's messages: { type: 'play', cell } -> { type: 'played', metrics, ms }
import { MONSTERS } from '../../../src/data/monsters.js';
import { ITEMS } from '../../../src/data/items.js';
import { HUNT_GROUNDS } from '../../../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../../../src/data/hunts.js';
import { GROUND_TIERS, tiersOf, tierRowOf, pullOfTier } from '../../../src/data/hunt-tiers.js';
import { charXpForLevel } from '../../../src/core/xp.js';
import { GROUND_ROSTER, FORMULA_EXCEPTIONS, formulaStats, contractXpPerH, tierRowFor } from '../../../src/data/balance-sheet.js';
import { SUPPLY } from '../../balance-program/standards.mjs';
import { PROJECTED, placeholderWhatIf } from '../../balance-program/grid-project.mjs';
import { KNOB_LIST } from '../virtual/knobs.mjs';
import { runCell, ENGINE_VERSION } from '../lab-core.mjs';
/* the sustain metrics (Balance Lab phase 2), one source with the matrix (matrix-metrics.mjs cellMetrics) */
import { sustainMetrics } from '../../balance-sim/sustain-reads.mjs';
/* the knob rule the bundle's instrumented numbers call (build.mjs __hrK): one rounding for the scratch copy and the browser */
export { knobValue } from '../../balance-program/knob-rules.mjs';

/* the fields the stat formula owns on a row (tools/gen-ground-stats.mjs FORMULA_FIELDS; parity.mjs holds the two lists and the rows equal) */
export const FORMULA_FIELDS = Object.freeze(['hp', 'atk', 'aim', 'evasion', 'def', 'xp', 'gp']);
const groundFit = (g) => ((g.pockets || []).some((p) => p.forParty) ? 'party' : g.groupFit || 'both');

/** THE ROWS FROM THE FORMULA (tools/balance-program/matrix-regen.mjs: gen-ground-stats proposeGround, named exceptions kept), in place. */
export function regenFormulaRows() {
  let moved = 0;
  for (const [g, roster] of Object.entries(GROUND_ROSTER)) {
    const floor = HUNT_INDEX[HUNT_GROUNDS[g].hunt].band[0], fit = groundFit(HUNT_GROUNDS[g]);
    for (const [id, role] of Object.entries(roster)) {
      const m = MONSTERS[id];
      if (!m) throw new Error('lab v3: the roster names ' + id + ', which is no monster');
      const f = formulaStats({ level: m.level, role, tier: m.tier, floor, fit, ground: g });
      for (const k of FORMULA_FIELDS) {
        if ((FORMULA_EXCEPTIONS[id] || {})[k]) continue;
        const v = Array.isArray(f[k]) ? [...f[k]] : f[k];
        if (JSON.stringify(m[k]) !== JSON.stringify(v)) { m[k] = v; moved++; }
      }
      m.formula = true;
    }
  }
  return moved;
}

/** A monster row as this lab plays it (a copy): parity.mjs reads the formula's re-written rows through it. */
export const liveMonster = (id) => (MONSTERS[id] ? JSON.parse(JSON.stringify(MONSTERS[id])) : null);

let started = null;
/** Once a created lab: the knobs it was created with, and the formula's rows re-written when a knob they are written from moved. */
export function start(knobs) {
  if (started) return started;
  const regenKnobs = KNOB_LIST.knobs.filter((k) => k.regen && knobs[k.id] !== undefined && knobs[k.id] !== 1).map((k) => k.id);
  started = { knobs: { ...knobs }, regen: regenKnobs, rowsMoved: regenKnobs.length ? regenFormulaRows() : 0, engine: ENGINE_VERSION };
  return started;
}

/* WHAT THE KNOBS MOVE IN A CELL'S PLAN (progression-grid.mjs buildCell, as the matrix plans an --diff on the copy's own formula): a PROJECTED
   cell's placeholder monsters and tier rows from the formula at its floor (grid-project.mjs placeholderWhatIf; its projected gear line is
   the knob-free tools line, kept from the build), and a harder tier's pull from the tier row the game reads now. */
const floorOf = (g) => HUNT_INDEX[HUNT_GROUNDS[g].hunt].band[0];
export function liveWhatIf(cell) {
  if (!cell.projected) return cell.whatIf || {};
  const w = placeholderWhatIf({ MONSTERS, GROUND_ROSTER, formulaStats, tierRowFor, tiersOf, floorOf, fitOf: (g) => groundFit(HUNT_GROUNDS[g]) }, cell.projected.floor);
  return { monsters: w.monsters, tiers: w.tiers, ...(cell.whatIf && cell.whatIf.items ? { items: cell.whatIf.items } : {}) };
}
function liveDensity(cell, w) {
  if (!cell.tier || cell.tier === 'normal') return cell.resolved.density;
  const row = cell.projected ? ((w.tiers || {})[PROJECTED.template] || {})[cell.tier] : tierRowOf(cell.resolved.ground, cell.tier);
  return row ? pullOfTier(row, cell.resolved.styles.length) || null : null;
}

/* A CELL'S WHAT-IF (tools/balance-sim/worker.mjs applyWhatIf, the parts a matrix cell names: placeholder monsters, their tier rows and the
   projected gear line), and the staged rows a seat wears; both put back after the cell. */
function applyCell(cell, w) {
  const undo = [];
  const set = (row, k, v) => { undo.push([row, k, Object.prototype.hasOwnProperty.call(row, k), row[k]]); row[k] = v; };
  for (const [id, f] of Object.entries(w.monsters || {})) if (MONSTERS[id]) for (const [k, v] of Object.entries(f)) set(MONSTERS[id], k, v);
  for (const [id, f] of Object.entries(w.items || {})) if (ITEMS[id]) for (const [k, v] of Object.entries(f)) set(ITEMS[id], k, v);
  for (const [g, byTier] of Object.entries(w.tiers || {})) if (GROUND_TIERS[g]) for (const [t, row] of Object.entries(byTier)) set(GROUND_TIERS[g], t, row);
  for (const [id, row] of Object.entries((cell.resolved && cell.resolved.staged) || {})) if (!ITEMS[id]) set(ITEMS, id, row);
  return () => { for (let i = undo.length - 1; i >= 0; i--) { const [row, k, had, v] = undo[i]; if (had) row[k] = v; else delete row[k]; } };
}

/**
 * THE SECTION 6 METRICS of one played cell (tools/balance-program/matrix-metrics.mjs cellMetrics over progression-grid.mjs cellRates, read
 * the same way off the same runner's answer: parity.mjs compares them). A head an hour unless named; shares as 0..1.
 */
export function liveMetrics(run, L) {
  const hs = run.heroes, n = hs.length, hh = hs.reduce((a, h) => a + h.hours, 0) || 1e-9, ph = run.party.hours || 1e-9;
  const sum = (f) => hs.reduce((a, h) => a + f(h), 0);
  const gross = sum((h) => h.raw.levelXp), lost = sum((h) => h.raw.xpLostLevel), income = sum((h) => h.raw.income), store = sum((h) => h.raw.store);
  const own = L >= SUPPLY.ownFromLevel ? SUPPLY.ownShare : 0;
  const dealt = sum((h) => h.dealtPerH * h.hours), taken = sum((h) => h.takenPerH * h.hours);
  const healed = sum((h) => h.healInPerH.total * h.hours), regen = sum((h) => (h.regenPerH || 0) * h.hours);
  const ttk = Object.values(run.party.ttkBy || {}).reduce((a, [ms, k]) => [a[0] + ms, a[1] + k], [0, 0]);
  /* the death rule's reads (cell.mjs header; progression-grid.mjs cellRates): XP after deaths and the Blessings' cut over the time offered */
  const wall = hs.reduce((a, h) => a + (Number.isFinite(h.raw.wallHours) ? h.raw.wallHours : h.hours), 0) || 1e-9;
  const lostB = sum((h) => (Number.isFinite(h.raw.xpLostLevelBlessed) ? h.raw.xpLostLevelBlessed : h.raw.xpLostLevel)), blessGold = sum((h) => h.raw.blessingGold || 0);
  const net = (gross - lostB) / wall;
  void lost;
  const lows = hs.map((h) => h.encMinHpPct.p50).filter((x) => x !== null), lows10 = hs.map((h) => h.encMinHpPct.p10).filter((x) => x !== null);
  const seatTaken = hs.map((h) => h.takenPerH);
  const allTaken = seatTaken.reduce((a, b) => a + b, 0);
  const sus = sustainMetrics([run]);
  return {
    dps: dealt / (ph * 3600), dpsHero: dealt / (ph * 3600) / n, takenPerH: taken / hh, healPerH: (healed + regen) / hh, levelXpPerH: gross / hh,
    netPerH: (income - store * (1 - own) - blessGold) / hh, netLevelXpPerH: net, huntedShare: hh / wall, storePerH: store / hh, suppliesPerH: sum((h) => Object.values(h.buysPerH || {}).reduce((a, b) => a + b, 0) * h.hours) / hh,
    killsPerH: run.party.killsPerH, ttkS: ttk[1] ? ttk[0] / ttk[1] / 1000 : null, deathsPer1000h: (1000 * sum((h) => h.deaths)) / hh,
    lowHpTypical: lows.length ? Math.max(0, Math.min(...lows)) / 100 : null, lowHpP10: lows10.length ? Math.max(0, Math.min(...lows10)) / 100 : null,
    hpUnder30: Math.max(...hs.map((h) => (h.hpUnder || {}).p30 || 0)), hpUnder10: Math.max(...hs.map((h) => (h.hpUnder || {}).p10 || 0)),
    hoursPerLevel: net > 0 ? (charXpForLevel(L + 1) - charXpForLevel(L)) / net : null, xContract: gross / hh / contractXpPerH(L),
    sustainRatio: sus ? sus.sustainRatio : null, regenShare: sus ? sus.regenShare : null, manaWaitsPerH: sus ? sus.manaWaitsPerH : null,
    seats: hs.map((h, i) => [h.style, allTaken > 0 ? seatTaken[i] / allTaken : null]),
  };
}

/** One live cell played (`cell.resolved` from cell.mjs resolveOnly, its what-if): the runner's whole answer (cell.mjs runCell's shape). */
export function playRun(cell) {
  if (!started) throw new Error('lab v3: start(knobs) first');
  const w = liveWhatIf(cell);
  const R = { ...cell.resolved, density: liveDensity(cell, w) };
  const undo = applyCell(cell, w);
  try {
    return runCell({ ground: R.ground, party: R.styles, resolved: R, hours: cell.hours, seeds: 1, seedBase: cell.seedBase || 0 });
  } finally { undo(); }
}
/** One live cell played and measured. */
export function play(cell) {
  const run = playRun(cell);
  return { metrics: liveMetrics(run, cell.resolved.levels[0]), hours: run.party.hours };
}

export function handle(msg, post) {
  const id = msg && msg.id;
  try {
    if (msg.type === 'play') { const t = Date.now(); post({ type: 'played', id, key: msg.cell.key, ...play(msg.cell), ms: Date.now() - t }); return; }
    if (msg.type === 'meta') { post({ type: 'meta', id, started, engine: ENGINE_VERSION }); return; }
    throw new Error('lab v3: unknown message ' + (msg && msg.type));
  } catch (e) {
    post({ type: 'error', id, message: String((e && e.message) || e) });
  }
}
