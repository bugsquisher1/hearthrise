// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/guard-cells.mjs — THE BALANCE GUARD'S LINES AND CELLS (balance program 30-plan section E, lane L14).
//
// LINES  the lines of section E (G1-G18; G1 and G7 RE-AIMED on the Danger scale and G3, G4, G5 RETIRED with a reason each, RETIRED
//        below, lane/econ-followups 2026-11-22), the plan audit's six (G19-G24, 31-plan-audit.md M2, M5, M9), the calibration line
//        K1 (the harness's four in the seats of the real Krell four, model.mjs REAL_KRELL_FOUR) and the nightly twin's two death lines
//        (D1, D2): what each is measured on, its target, its red band, the lane that turns it red, and its MODE. A line starts as
//        `report` and turns `red` in the lane that lands the change it guards (section E: "It never goes back"): that lane flips
//        `mode` here, in the same commit. A line with a `gate` ('xp' or 'gold') reads the harness's party and is judged only while K1
//        reads the real Krell four inside K1's own target on that measure (31-plan-audit M3); outside it, it reports "uncalibrated".
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
export const POOL_POINTS = P('glade', 'slake', 'hold');                         // G10, G11, G12: "Levels 30, 60, 105"
export const DEADLY_POINTS = P('ford', 'pyre', 'hold');                          // G8, D1, D2: "Ford, Pyre, Krell" / "Levels 50, 80, 105"
/* THE SCALE'S CELLS (lane/econ-followups, 2026-11-22): G1 on every Danger scale ground (src/data/danger.js DANGER_GROUNDS) at the Level its
   reference step was measured at (tests/level-curve.mjs REF_LEVEL, the same as C7 and V4): the mixed four from its held start (refStep -
   startMargin, the game's own rule) and a lone hero of each reference seat from the band's floor (12-targets 3.1: a first hunt starts at
   depth 1; measured 2026-11-22 a lone hero's hold lands the same from the floor or the four's start, 0.67 / 0.68 of the four's head). */
export const SCALE_FOUR = Object.freeze(['hammer', 'bow', 'mage', 'healer']);
export const SCALE_LONE = Object.freeze(['hammer', 'mage']);
const FOUR = REF_SEATS.find((s) => s.id === 'four');
const LONE = REF_SEATS.find((s) => s.id === 'lone');

/* G8's four (30-plan A, "After the Krell hunt" item 3): it buys the cheaper runes, heals with its healer and makes a QUARTER of its
   supplies; its gear is sold (the cell's income values every drop at the Shop's price). Two linings are not built (L32): none counted. */
export const G8_OWN_SHARE = 0.25;
/* G11's hero trains every idle hour: the Own four's day (model.mjs REFERENCE_PLAYERS 'ownfour': 24 h less its hunted and town hours),
   every day since the yard opens to it (src/data/training.js TRAINING_RULES.minLevel), on the lone pace table (src/data/core-model.js
   LEVEL_PACE.targets: the slowest an Own four hero reaches a Level, so an UPPER BOUND on the hours trained). */
export const G11_PLAYER = 'ownfour';
/* (G19's pair and three, SMALL_PARTIES at SMALL_POINTS, retired with the tier rows: RETIRED below) */
/* (G9 and G20 retired 2026-11-21 with the slot prices: patches/fb5-free-hero-slots.json) */
/* G23 (21-combat.md B4, PROPOSED; the tank and the Healer by ruling): the share of the offense lane a discipline's offense rows may fill. */
export const BAR_BUDGET = Object.freeze({ '*': 0.85, shield: 0.6, restoration: 0.3 });
/* K1'S GATE (30-plan section E as re-issued 2026-11-20, 31-plan-audit M3): the band K1 must read for a line on the harness's party to be judged. */
export const K1_GATE = Object.freeze({ xp: Object.freeze([0.9, 1.1]), gold: Object.freeze([0.8, 1.2]) });
/* G21 (nightly): the Tower from the landing at the hero's Level (tools/balance-program/endgame.mjs climb --from level, 90 minutes, 2 seeds). */
export const TOWER_FOURS = P('glade', 'slake', 'hold');
export const TOWER_LONE = P('thicket', 'glade');
export const towerLanding = (L) => Math.max(0, Math.floor(L / 10) * 10) + 1;

/* ── THE LINES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   target / keep: [lo, hi] (null = open). A value inside `target` is in band; outside `target` and inside `keep` is OFF (reported);
   outside `keep` is RED. `mode` 'report' lists a red line and exits 0; 'red' exits 1 on it (--strict treats every line as 'red'). */
export const LINES = Object.freeze([
  /* G1 RE-AIMED (lane/econ-followups, 2026-11-22): was "Lone hammer on Normal, x the pace contract" on the eight tier points. The redesign
     puts the pace contract on the four at its held depth (tests/level-curve.mjs C7, T-02 re-aimed), and a lone hero's place is 12-targets
     C-7 (RD-Q7 a): a lone hero earns 0.5x to 0.8x of a four's head. keep: a lone hero never out-earns the four's head (1.0, which would
     undo C-6) and never falls under 0.4 (JUDGMENT: under it hunting alone is not a choice). Measured 2026-11-22 on Muster at Level 60,
     2 seeds x 1 h: hammer 0.67, mage 1.02 (a lone Mage out-earns the four's head: a C-7 finding for the designer). */
  { id: 'G1', words: 'A lone hero on a scale ground, x the mixed four a head (C-7)', on: 'every Danger scale ground at its reference Level, Steady: the lone hammer and the lone Mage from the band\'s floor, the mixed four from its held start', target: [0.5, 0.8], keep: [0.4, 1.0], turnsRedIn: 'V6 (12-targets C-7)', mode: 'report' },
  { id: 'G2', words: 'No way to fight runs away alone: best way / median way', on: 'every way at the eight points', target: [null, 1.5], keep: [null, 1.6], turnsRedIn: 'L17', mode: 'report' },
  { id: 'G6', words: 'The new player on the start kit: hours to Level 10; the longest Level under 10', on: 'life.mjs, src/data/core-model.js LEVEL_PACE.newPlayer (the start-kit tank, policy new: Hunt again in the Thicket), Normal, no event', target: null, keep: null, turnsRedIn: 'L05 (red since lane/c-levels-7-9)', mode: 'red',
    parts: { level10: { target: [null, 6], keep: [null, 7] }, step: { target: [null, 2], keep: [null, 2.5] } } },
  /* G7 RE-AIMED (lane/econ-followups, 2026-11-22): was "a ground never pays a lone in-range hero less gold (in) than the one before" on the
     eight tier points, played. On the scale moving on is 12-targets C-11: depth 1 of the next ground pays at least 1.1x depth 20 of the last.
     READ FROM DATA (src/data/danger.js DANGER_GROUNDS in gearLevel order, PAY, src/data/wage.js): a hold's coin in the wage's unit is
     wage(gearLevel) x max(PAY.floor, (1 + payStepCoin) ^ min(step - refStep, gapMax)), the engine's coin rule on the wage the ground's
     reference depth was calibrated to. One scale ground today: printed n/a until R10 opens a second (its proof plants one). keep: under
     1.0 the next ground's first depth pays less than this ground's top (a pay cut for moving on). */
  { id: 'G7', words: 'The next scale ground pays more from its first depth: depth 1 / the last ground\'s depth 20 (C-11)', on: 'consecutive Danger scale grounds by base item Level, read from data', target: [1.1, null], keep: [1.0, null], turnsRedIn: 'R10 (12-targets C-11)', mode: 'report' },
  { id: 'G8', words: 'Deadly costs gold and never loses it: net a hero-hour, Krell-kit four', on: 'Levels 50, 80, 105', target: [3000, 8000], keep: [0, null], turnsRedIn: 'L16 (re-read L32)', mode: 'report', gate: 'gold' },
  { id: 'G10', words: 'The gear pool over the played kit: XP, and its damage cut / one armor step\'s', on: 'Levels 30, 60, 105, lone and four', target: null, keep: null, turnsRedIn: 'L15 (damage), L37 (XP)', mode: 'report',
    parts: { xp: { target: [null, 1.09], keep: [null, 1.10] }, dmg: { target: [null, 1], keep: [null, 1] } } },
  { id: 'G11', words: 'The hero that trains every idle hour: XP, and damage cut', on: 'Levels 30, 60, 105', target: null, keep: null, turnsRedIn: 'never (a report line, never a gate: 30-plan 31-7)', mode: 'report',
    parts: { xp: { target: [null, 1.05], keep: [null, 1.05] }, dmg: { target: [null, 0.15], keep: [null, 0.15] } } },
  { id: 'G12', words: 'No gold-for-power offer under 1 lone hour of gold a +1% Level XP', on: 'Tempering, the yard, training items', target: [1, null], keep: [1, null], turnsRedIn: 'L19', mode: 'report' },
  { id: 'G13', words: 'Magic Find from every source at 5,000 hours with the ring', on: 'the Luck bar (not built)', target: [null, 104], keep: [null, 104], turnsRedIn: 'L20', mode: 'report', notBuilt: 'L20' },
  { id: 'G14', words: 'The lever list is closed: every lever in the data has a class; cut and dark levers never grow', on: 'a scan of src/data/*', target: null, keep: null, turnsRedIn: 'L14', mode: 'red', bands: '0 strangers, every cut or dark lever at its pin / red on a stranger or a pin passed' },
  { id: 'G15', words: 'Every price past Krell is a share of the band index (shares sum 1.2 to 1.4)', on: 'the price rows (not built)', target: [1.2, 1.4], keep: [1.2, 1.4], turnsRedIn: 'L47', mode: 'report', notBuilt: 'L47' },
  { id: 'G16', words: 'Server cost a reference account a day (statements, row writes, journal rows, DB s) / baseline', on: 'per-player-cost fixtures, measure.mjs accountCost', target: [null, 1], keep: [null, 1.05], turnsRedIn: 'L11', mode: 'report' },
  { id: 'G17', words: 'Engine ms a 100 s window (harness-inclusive, this machine)', on: 'a Krell four on Deadly, a Tower climb', target: [null, 200], keep: [null, 200], turnsRedIn: 'L11', mode: 'report', machine: true },
  { id: 'G18', words: 'Hunted hours a hero a day: the Own four; every hero\'s ceiling', on: 'model.mjs players, stamina and refill rows', target: null, keep: null, turnsRedIn: 'L40', mode: 'report',
    parts: { ownfour: { target: [12, 12], keep: [null, 12] }, ceiling: { target: [null, 24], keep: [null, 24] } },
    bands: 'the Own four at 12 h, the most a hero hunts with no refill (RULED 2026-11-21: every player is counted at 12 h a hero a day) / red past 12 with no new press' },
  { id: 'K1', words: 'Calibration: the harness four in the real Krell four\'s seats / the real hunt', on: 'model.mjs REAL_KRELL_FOUR (THIN)', target: [0.9, 1.1], keep: [0.75, 1.25], turnsRedIn: 'never alone (the designer sets its band)', mode: 'report' },
  { id: 'D1', words: 'Nightly twin: deaths a 100 hero-hours, the four on Deadly in band', on: 'Ford, Pyre, Krell, 4 seeds x 8 h', target: [1, 3.34], keep: [null, 6.25], turnsRedIn: 'L16', mode: 'report', nightly: true, gate: 'xp' },
  { id: 'D2', words: 'Nightly twin: deaths a 100 hero-hours, the four 10 Levels under the floor', on: 'Ford, Pyre, Krell, 4 seeds x 8 h', target: [6.25, null], keep: [6.25, null], turnsRedIn: 'L16', mode: 'report', nightly: true, gate: 'xp' },
  /* THE PLAN AUDIT'S LINES (docs/design/balance-program/31-plan-audit.md M2, M5, M9; the Coordinator 2026-11-20), all report. */
  { id: 'G21', words: 'The Tower: a set-up four tops out between its Level and Level + 25; no hero from 10 to 30 earns more there than hunting', on: 'nightly: climbs from the landing (endgame.mjs climb --from level), fours at 30, 60, 105, a lone hammer and Mage at 10 and 30', target: null, keep: null, turnsRedIn: 'L18', mode: 'report', nightly: true,
    parts: { top: { target: [0, 25], keep: [0, 25] }, xp: { target: [null, 1], keep: [null, 1] } }, bands: 'top - Level 0-25; Tower XP / hunting XP <=1 (22-1, 22-7)' },
  { id: 'G22', words: 'Stamina refills: the second pays for itself alone at every Level; six are gold-neutral for the four at 80', on: 'stamina-refill.js rows, played net gold', target: null, keep: null, turnsRedIn: 'L06', mode: 'report',
    parts: { pays: { target: [null, 1], keep: [null, 1] }, six: { target: [0.9, 1.1], keep: [0.75, 1.33] } }, bands: 'refill 2 / its 4 h of lone net <=1; six / 24 h of net for the four 0.9-1.1, red outside 0.75-1.33 (24-1)' },
  { id: 'G23', words: 'The bar budget: the offense rows of a family fill at most 0.85 of the offense lane (the tank 0.6, the Healer 0.3)', on: 'abilities.js ABILITIES and ABILITY_LANES', target: null, keep: null, turnsRedIn: 'L17', mode: 'report', bands: 'at most its cap / red over it (21-6)' },
]);

/* ── RETIRED LINES (lane/econ-followups, 2026-11-22): report-only Normal/Deadly tier-path contracts the redesign replaces (12-targets 2.6:
   "old-design numbers are replaced by new files as each redesign wave lands"). Each reason names what holds the question now; the guard
   prints them and plays none of their cells. */
export const RETIRED = Object.freeze({
  G3: 'The four on Deadly x the contract (1.8-2.5x): the Deadly tier\'s pace premium. On the scale a four is paid by depth (04 section 7), '
    + 'and the four\'s pace at its held depth is tests/level-curve.mjs C7 (T-02 re-aimed: the hours table +-20%, judged in CI on every scale '
    + 'ground). Its real-engine proof and the K1 gate\'s control moved to G19, and with G19 to G8 (lane/retire-tier-chain).',
  G4: 'The fully invested four on Deadly (old-tier uniques, the Hearth Chest, Tempering 5/5, +10 skills) under 2.75x: on the scale investment '
    + 'moves the hold, never a tier dial, and what any hold pays a kill is bounded by construction at gapMax (src/data/danger.js PAY; the '
    + 'server\'s hr_danger_level_xp_max). The question it asked is C-2 (a gear tier moves the hold 1 to 3 depths), measured by lane/econ-levers '
    + '(-13.2 / +20.3) and owed a guard with R10\'s second ground; the invested kit itself is wave 3/4 (Traits, base items).',
  G5: 'Deadly is a fight (the four\'s HP p10 35-50%, and 10 Levels under the floor under 25%): on the scale the stance defines the fight. The '
    + 'climb pushes a company until its pulls stop being clean (RISKS cleanPm) and it breaks off at fallPm, so its low point sits between them '
    + 'by construction (src/data/danger.js); a weaker company holds shallower instead of dying. Deaths by stance are 12-targets C-3 and C-4 '
    + '(V2 stance runs).',
  G19: 'The pair and the three on Deadly x the contract a head (1.8-2.5x): a tier-path contract like G3, retired with the tier rows '
    + '(lane/retire-tier-chain 2026-11-26; on their ground as built they read 0.7-1.4x, under the band it was set for). On the scale a party is '
    + 'paid by depth; the pair and the three at their held depth are the designer\'s to band (12-targets C-6, CONFLICTS 2026-11-26). Its '
    + 'real-engine proof and the K1 gate\'s control moved to G8, the gated line a played four still reads.',
  G24: 'A scaled hunt is never the best lone XP: the scaled hunts retired with the tier chain (1071-retire-tier-chain.sql, lane/retire-tier-chain '
    + '2026-11-26). An outgrown ground is left for the next ground on the scale; what a deeper step pays over the next ground is 12-targets C-11 (G7).',
});

/* ── THE CELLS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   ctx: { tiers (the program's tier column, tools/balance-sim/tier-axis.mjs: Normal alone), refCell (measure.mjs), lines + skillsAt (skill-lines.mjs), bandOf(ground) -> [lo, hi],
   towerHunt (tower.js TOWER_RULES.hunt), MAIN (measure.mjs), scaleGrounds ([{ id, level, heldStart, floorStep }], every Danger scale
   ground), scaleCell(ground, level, styles, start) (a Steady cell on the scale from `start`) }. Answers [{ id, cell }]; a cell is what
   cell.mjs runCell plays. */
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
  /* G1: every scale ground, the mixed four from its held start and each lone reference seat from the band's floor, Steady (ctx.scaleCell:
     tools/balance-program/redesign/held-four.mjs's cell, the matrix's MID kits and played bars) */
  for (const g of ctx.scaleGrounds) {
    push('scale-four:' + g.id, ctx.scaleCell(g.id, g.level, SCALE_FOUR, g.heldStart));
    for (const style of SCALE_LONE) push('scale-lone:' + g.id + ':' + style, ctx.scaleCell(g.id, g.level, [style], g.floorStep));
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
  /* G8 (and G22's six) */
  for (const p of DEADLY_POINTS) {
    const four = ref(p, FOUR);
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

/** The nightly twin: the cells that judge a death rate (D1, D2) at the nightly size, and the slow line (G21's Tower climbs). */
export function nightlyCells(ctx, size = SIZES.nightly) {
  const { hours, seeds } = size;
  const out = [];
  for (const p of DEADLY_POINTS) {
    const four = ctx.refCell({ tiers: ctx.tiers }, p, FOUR, hours, seeds).cell;
    out.push({ id: 'twin-band:' + p.id, cell: { ...four, id: 'BG:twin-band:' + p.id, hours, seeds } });
    out.push({ id: 'twin-under:' + p.id, cell: { ...four, id: 'BG:twin-under:' + p.id, hours, seeds, level: ctx.bandOf(p.ground)[0] - 10 } });
  }
  /* G21: endgame.mjs climb's own cell (90 minutes at most, a run is one segment a seed, 2 seeds), from the landing at the Level */
  const climb = (id, party, L) => out.push({ id, cell: { id: 'BG:' + id, ground: ctx.towerHunt, tower: { floor: towerLanding(L) }, hours: 1.5, seeds: 2, windowMs: 30000,
    party: [...party], level: L, profile: 'played', supply: 'own', gear: { uniques: true } } });
  for (const p of TOWER_FOURS) climb('tower-four:' + p.id, FOUR.party, p.level);
  for (const p of TOWER_LONE) for (const style of ['hammer', 'mage']) climb('tower-lone:' + p.id + ':' + style, [style], p.level);
  return out;
}
