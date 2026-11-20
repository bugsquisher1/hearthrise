// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/guard-cells.mjs — THE BALANCE GUARD'S LINES AND CELLS (balance program 30-plan section E, lane L14).
//
// LINES  the eighteen lines of section E (G1-G18), the calibration line K1 (the harness's four in the seats of the real Krell four,
//        model.mjs REAL_KRELL_FOUR) and the nightly twin's two death lines (D1, D2): what each is measured on, its target, its red
//        band, the lane that turns it red, and its MODE. A line starts as `report` and turns `red` in the lane that lands the change
//        it guards (section E: "It never goes back"): that lane flips `mode` here, in the same commit.
// CELLS  every scenario the guard plays on the real settle (tools/balance-sim/cell.mjs), keyed by id. The reference cells ARE
//        measure.mjs's (refCell), so a guard number and a dive's number are the same cell. Nothing here is a measured number:
//        a band is the plan's, a cell names a ground, a party, a Level and what it wears.
//
// PURE but for the data it reads through `ctx` (tests/balance-guard.mjs builds it). Imports only the model.
// ════════════════════════════════════════════════════════════════════════
import { REF_POINTS, REF_SEATS, REAL_KRELL_FOUR } from './model.mjs';

/* One cell's dice: the plain run (section E: "2 seeds x 1 h") and the nightly twin ("4 seeds x 8 h", the only run that judges a death). */
export const SIZES = Object.freeze({ plain: Object.freeze({ hours: 1, seeds: 2 }), nightly: Object.freeze({ hours: 8, seeds: 4 }) });

/* Where lines are read. */
export const BY_ID = Object.freeze(Object.fromEntries(REF_POINTS.map((p) => [p.id, p])));
const P = (...ids) => ids.map((id) => BY_ID[id]);
export const ALL_POINTS = REF_POINTS;
export const FOUR_POINTS = REF_POINTS.filter((p) => p.level >= 30);           // G3, G4: "Levels 30 to 175"
export const POOL_POINTS = P('glade', 'slake', 'hold');                         // G10, G11, G12: "Levels 30, 60, 105"
export const DEADLY_POINTS = P('ford', 'pyre', 'hold');                          // G5, G8, D1, D2: "Ford, Pyre, Krell" / "Levels 50, 80, 105"
const FOUR = REF_SEATS.find((s) => s.id === 'four');
const LONE = REF_SEATS.find((s) => s.id === 'lone');

/* G8's four (30-plan A, "After the Krell hunt" item 3): it buys the cheaper runes, heals with its healer and makes a QUARTER of its
   supplies; its gear is sold (the cell's income values every drop at the Shop's price). Two linings are not built (L32): none counted. */
export const G8_OWN_SHARE = 0.25;
/* G11's hero trains every idle hour: the Own four's day (model.mjs REFERENCE_PLAYERS 'ownfour': 24 h less its hunted and town hours),
   every day since the yard opens to it (src/data/training.js TRAINING_RULES.minLevel), on the lone pace table (src/data/core-model.js
   LEVEL_PACE.targets: the slowest an Own four hero reaches a Level, so an UPPER BOUND on the hours trained). */
export const G11_PLAYER = 'ownfour';

/* ── THE LINES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   target / keep: [lo, hi] (null = open). A value inside `target` is in band; outside `target` and inside `keep` is OFF (reported);
   outside `keep` is RED. `mode` 'report' lists a red line and exits 0; 'red' exits 1 on it (--strict treats every line as 'red'). */
export const LINES = Object.freeze([
  { id: 'G1', words: 'Lone hammer on Normal, x the pace contract', on: 'the eight points', target: [0.9, 1.1], keep: [0.85, 1.25], turnsRedIn: 'L16 (staged points L47)', mode: 'report' },
  { id: 'G2', words: 'No way to fight runs away alone: best way / median way', on: 'every way at the eight points', target: [null, 1.5], keep: [null, 1.6], turnsRedIn: 'L17', mode: 'report' },
  { id: 'G3', words: 'The four on Deadly in band, played kit, x contract', on: 'Levels 30 to 175', target: [1.8, 2.5], keep: [1.6, 2.6], turnsRedIn: 'L16', mode: 'report' },
  { id: 'G4', words: 'The four on Deadly fully invested, x contract', on: 'Levels 30 to 175', target: [null, 2.75], keep: [null, 2.9], turnsRedIn: 'L16 (re-read L29, L37, L44)', mode: 'report' },
  { id: 'G5', words: 'Deadly is a fight: the four\'s low point (HP p10 %)', on: 'Ford, Pyre, Krell; in band and 10 under the floor', target: null, keep: null, turnsRedIn: 'L16', mode: 'report',
    parts: { band: { target: [35, 50], keep: [30, 55] }, under: { target: [null, 25], keep: [null, 35] } } },
  { id: 'G6', words: 'The new player on the start kit: hours to Level 10; the longest Level under 10', on: 'life.mjs --policy idle, Normal, no event', target: null, keep: null, turnsRedIn: 'L05', mode: 'report',
    parts: { level10: { target: [null, 6], keep: [null, 7] }, step: { target: [null, 2], keep: [null, 2.5] } } },
  { id: 'G7', words: 'A ground never pays a lone in-range hero less gold (in) than the one before', on: 'the eight points', target: null, keep: null, turnsRedIn: 'L22', mode: 'report', bands: 'rising / red on any fall' },
  { id: 'G8', words: 'Deadly costs gold and never loses it: net a hero-hour, Krell-kit four', on: 'Levels 50, 80, 105', target: [3000, 8000], keep: [0, null], turnsRedIn: 'L16 (re-read L32)', mode: 'report' },
  { id: 'G9', words: 'The first hero slot within one lone hero\'s bank at Level 32: price / bank', on: 'shops.js character_slot.1, gold-model.mjs BANK', target: [null, 1], keep: [null, 1], turnsRedIn: 'L06', mode: 'report' },
  { id: 'G10', words: 'The gear pool over the played kit: XP, and its damage cut / one armor step\'s', on: 'Levels 30, 60, 105, lone and four', target: null, keep: null, turnsRedIn: 'L15 (damage), L37 (XP)', mode: 'report',
    parts: { xp: { target: [null, 1.09], keep: [null, 1.10] }, dmg: { target: [null, 1], keep: [null, 1] } } },
  { id: 'G11', words: 'The hero that trains every idle hour: XP, and damage cut', on: 'Levels 30, 60, 105', target: null, keep: null, turnsRedIn: 'L19', mode: 'report',
    parts: { xp: { target: [null, 1.05], keep: [null, 1.05] }, dmg: { target: [null, 0.15], keep: [null, 0.15] } } },
  { id: 'G12', words: 'No gold-for-power offer under 1 lone hour of gold a +1% Level XP', on: 'Tempering, the yard, training items', target: [1, null], keep: [1, null], turnsRedIn: 'L19', mode: 'report' },
  { id: 'G13', words: 'Magic Find from every source at 5,000 hours with the ring', on: 'the Luck bar (not built)', target: [null, 104], keep: [null, 104], turnsRedIn: 'L20', mode: 'report', notBuilt: 'L20' },
  { id: 'G14', words: 'The lever list is closed: every lever in the data has a class; cut and dark levers never grow', on: 'a scan of src/data/*', target: null, keep: null, turnsRedIn: 'L14', mode: 'red', bands: '0 strangers, every cut or dark lever at its pin / red on a stranger or a pin passed' },
  { id: 'G15', words: 'Every price past Krell is a share of the band index (shares sum 1.2 to 1.4)', on: 'the price rows (not built)', target: [1.2, 1.4], keep: [1.2, 1.4], turnsRedIn: 'L47', mode: 'report', notBuilt: 'L47' },
  { id: 'G16', words: 'Server cost a reference account a day (statements, row writes, journal rows, DB s) / baseline', on: 'per-player-cost fixtures, measure.mjs accountCost', target: [null, 1], keep: [null, 1.05], turnsRedIn: 'L11', mode: 'report' },
  { id: 'G17', words: 'Engine ms a 100 s window (harness-inclusive, this machine)', on: 'a Krell four on Deadly, a Tower climb', target: [null, 200], keep: [null, 200], turnsRedIn: 'L11', mode: 'report', machine: true },
  { id: 'G18', words: 'Hunted hours a hero a day: the Own four; every hero\'s ceiling', on: 'model.mjs players, stamina and refill rows', target: null, keep: null, turnsRedIn: 'L40', mode: 'report',
    parts: { ownfour: { target: [3.3, 5.3], keep: [null, 6] }, ceiling: { target: [null, 24], keep: [null, 24] } } },
  { id: 'K1', words: 'Calibration: the harness four in the real Krell four\'s seats / the real hunt', on: 'model.mjs REAL_KRELL_FOUR (THIN)', target: [0.9, 1.1], keep: [0.75, 1.25], turnsRedIn: 'never alone (the designer sets its band)', mode: 'report' },
  { id: 'D1', words: 'Nightly twin: deaths a 100 hero-hours, the four on Deadly in band', on: 'Ford, Pyre, Krell, 4 seeds x 8 h', target: [1, 3.34], keep: [null, 6.25], turnsRedIn: 'L16', mode: 'report', nightly: true },
  { id: 'D2', words: 'Nightly twin: deaths a 100 hero-hours, the four 10 Levels under the floor', on: 'Ford, Pyre, Krell, 4 seeds x 8 h', target: [6.25, null], keep: [6.25, null], turnsRedIn: 'L16', mode: 'report', nightly: true },
]);

/* ── THE CELLS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   ctx: { tiers (src/data/hunt-tiers.js), refCell (measure.mjs), lines + skillsAt (skill-lines.mjs), bandOf(ground) -> [lo, hi],
   towerHunt (tower.js TOWER_RULES.hunt), MAIN (measure.mjs) }. Answers [{ id, cell }]; a cell is what cell.mjs runCell plays. */
const STYLES_ALONE = ['hammer', 'mage', 'tank', 'sword', 'axes', 'bow', 'crossbow', 'healer'];   // tools/balance-sim/styles.mjs, every way
const staged = (p) => (p.open ? {} : { uniques: true, openAlso: [p.ground] });
const temperAt = (tier, tracks = ['blows', 'armor']) => Object.fromEntries(tracks.map((t) => ['temper:' + t + ':' + tier, 5]));

/** Skills a seat by seat: the career line (party or alone) at the Level, `bump` added to the listed skills ('main' = the style's own). */
export function seatSkills(ctx, party, level, bump = {}) {
  return party.map((style, i) => {
    const L = Array.isArray(level) ? level[i] : level;
    const lv = { ...ctx.skillsAt(ctx.lines, party.length > 1 ? 'party' : 'alone', style, L) };
    const main = ctx.MAIN[style] || 'melee';
    for (const [k, n] of Object.entries(bump)) { const key = k === 'main' ? main : k; lv[key] = (lv[key] || 1) + n; }
    return lv;
  });
}

/* A cell read only for SUMS (Level XP, gold, kills, damage taken, deaths) settles in 60 s windows: the engine walks the same swings
   whatever the cut (TICK-1; measured here 2026-11-20: bow, Healer and crossbow at Pyre Field, identical XP and kills at 10 s, 60 s
   and 300 s) and plays about a fifth faster. Only the LOW POINT reads the cut (cell.mjs re-anchors its HP tracking at each window), so the
   cells a low point is read from (G5: the reference four and the four under Level) keep their own cut, and every reference cell stays
   measure.mjs's to the byte. */
export const SUMS_WINDOW_MS = 60000;

export function plainCells(ctx, size = SIZES.plain) {
  const { hours, seeds } = size;
  const out = [];
  const push = (id, cell, sumsOnly = true) => out.push({ id, cell: { id: 'BG:' + id, hours, seeds, ...cell, ...(sumsOnly ? { windowMs: SUMS_WINDOW_MS } : {}) } });
  const ref = (p, seat) => ctx.refCell({ tiers: ctx.tiers }, p, seat, hours, seeds).cell;
  for (const p of ALL_POINTS) {
    for (const seat of REF_SEATS) push('ref:' + p.id + ':' + seat.id, ref(p, seat), false);
    /* G2: every other way alone on Normal, the played profile (the hammer and the Mage are the reference seats) */
    for (const style of STYLES_ALONE.filter((s) => s !== 'hammer' && s !== 'mage')) {
      push('way:' + p.id + ':' + style, { ground: p.ground, party: [style], level: p.level, profile: 'played', ...(p.open ? {} : { gear: staged(p) }) });
    }
  }
  /* G4: the four fully invested (30-plan B): the gettable uniques and the Hearth Chest's pieces, both Tempering tracks 5 of 5 on the tier,
     main skill and Defense 10 over the party line. Necrotic and Storm (switch off) and faction skills (not built) do not exist yet. */
  for (const p of FOUR_POINTS) {
    const base = ref(p, FOUR);
    push('four-full:' + p.id, { ...base, gear: { ...(base.gear || {}), uniques: true, chest: true }, temper: temperAt(p.gearTier),
      skillsBySeat: seatSkills(ctx, base.party, p.level, { main: 10, defense: 10 }) });
  }
  /* G10, G11, G12 at Levels 30, 60, 105 */
  for (const p of POOL_POINTS) {
    const lone = ref(p, LONE), four = ref(p, FOUR);
    const pool = { temper: temperAt(p.gearTier) };
    push('lone-pool:' + p.id, { ...lone, ...pool, skillsBySeat: seatSkills(ctx, lone.party, p.level, { main: 10, defense: 10 }) });
    push('four-pool:' + p.id, { ...four, ...pool, skillsBySeat: seatSkills(ctx, four.party, p.level, { main: 10, defense: 10 }) });
    /* one armor step: the same hero in armor one tier behind (gear.mjs tierOffset on the armour group) */
    push('lone-armor-1:' + p.id, { ...lone, gear: { ...(lone.gear || {}), tierOffset: -1, only: 'armour' } });
    push('four-armor-1:' + p.id, { ...four, gear: { ...(four.gear || {}), tierOffset: -1, only: 'armour' } });
    /* G12's prices: Blows 5 of 5 alone, and the main skill 10 over the line alone */
    push('lone-blows:' + p.id, { ...lone, temper: temperAt(p.gearTier, ['blows']) });
    push('lone-main10:' + p.id, { ...lone, skillsBySeat: seatSkills(ctx, lone.party, p.level, { main: 10 }) });
    /* G11: every idle hour in the yard, all on the main skill (the XP reading) or all on Defense (the damage reading) */
    const t = ctx.yardLevels(p.level);
    push('lone-yard-main:' + p.id, { ...lone, skillsBySeat: seatSkills(ctx, lone.party, p.level, { main: t.main }) });
    push('lone-yard-def:' + p.id, { ...lone, skillsBySeat: seatSkills(ctx, lone.party, p.level, { defense: t.defense }) });
  }
  /* G5 and G8 */
  for (const p of DEADLY_POINTS) {
    const four = ref(p, FOUR);
    push('four-under:' + p.id, { ...four, level: ctx.bandOf(p.ground)[0] - 10 }, false);
    push('four-real:' + p.id, { ...four, runeTierByRole: { ...REAL_KRELL_FOUR.runeTierByRole } });
  }
  /* K1: the harness's four in the real Krell four's seats */
  {
    const R = REAL_KRELL_FOUR, party = R.seats.map((s) => s.style), level = R.seats.map((s) => s.level);
    const line = seatSkills(ctx, party, level);
    const pull = ctx.tiers.pullOfTier(ctx.tiers.tierRowOf(R.ground, R.tier), party.length);
    push('krell-real', { ground: R.ground, party, level, profile: 'played', options: { tier: R.tier }, ...(pull ? { density: pull } : {}),
      skillsBySeat: line.map((lv, i) => ({ ...lv, ...R.seats[i].skills })), runeTierByRole: { ...R.runeTierByRole } });
  }
  /* G17: engine time a 100 s window (one seed, short: a timing, not a balance reading) */
  {
    const hold = ref(BY_ID.hold, FOUR);
    out.push({ id: 'time-krell', cell: { ...hold, id: 'BG:time-krell', hours: 0.5, seeds: 1, windowMs: 100000 } });
    out.push({ id: 'time-tower', cell: { id: 'BG:time-tower', ground: ctx.towerHunt, tower: { floor: 60 }, hours: 1 / 3, seeds: 1, windowMs: 100000,
      party: ['tank', 'healer', 'bow', 'mage'], level: 60, profile: 'played', supply: 'own', gear: { uniques: true } } });
  }
  return out;
}

/** The nightly twin: the cells that judge a death rate (D1, D2), at the nightly size. */
export function nightlyCells(ctx, size = SIZES.nightly) {
  const { hours, seeds } = size;
  const out = [];
  for (const p of DEADLY_POINTS) {
    const four = ctx.refCell({ tiers: ctx.tiers }, p, FOUR, hours, seeds).cell;
    out.push({ id: 'twin-band:' + p.id, cell: { ...four, id: 'BG:twin-band:' + p.id, hours, seeds } });
    out.push({ id: 'twin-under:' + p.id, cell: { ...four, id: 'BG:twin-under:' + p.id, hours, seeds, level: ctx.bandOf(p.ground)[0] - 10 } });
  }
  return out;
}
