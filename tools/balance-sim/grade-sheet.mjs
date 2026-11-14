// tools/balance-sim/grade-sheet.mjs — THE GRADER'S LOCAL TARGET SHEET, until the formula lane's src/data/balance-sheet.js lands
// (lane/b-ground-formula owns the real one; `grade.mjs --sheet <module>` reads any module exporting SHEET in this shape).
//
// A copy of the targets as ruled, never invented: Tyler's balance ruling 2026-10-25 (memory balance-ruling-2026-10-25.md) and the
// rulings of record to 2026-11-07. Each rule names where it applies (tier, Level offset, party size, the ground's fit), the metric,
// its bound, whether it is BINDING (off-target turns the grader red) or ADVISORY (ranked, never red), and the ruling it copies.
//
// Offsets: under5, under3, under2 (Levels under the ground's floor), floor, plus10 (inside the band), top (the band's top), above
// (floor+10 past the top). In range = floor, plus10, top. Sizes 1-4. Metrics (grade.mjs METRICS): deaths and dips per hour are
// pooled per ground x tier x offset x size and judged on their 95% interval (FAIL only when the interval's low end is past the
// bound, UNPROVEN when only its high end is); every other metric is the cell's own number.
/* THE FOUR'S LINE, WHERE IT BINDS (designer 2026-11-13, lane/d-no-profit-molds; Tyler 10-25 §5 "a well-built four earns 15-25% more XP a head
   than a comparable solo"). It binds a WELL-BUILT four, one of all four classes (Melee, Ranger, Mage, Healer), at the band's floor and middle,
   where a party cell is fitted. Two places it reports instead (an advisory OFF, never red):
     a three-class four (two Melee and no Healer, say) is paid its own, smaller cell by design (Tyler 10-31, party-class-xp.js), so 1.05-1.15 is
       the rule working, not a miss;
     the band's TOP is where a ground is being outgrown: a hero alone there kills in fewer blows and closes on the four, so the four's edge
       narrows (the full grade 2026-11-13: Sewer 1.13 and Warrens 1.12 at their tops, 1.20-1.25 at their floors). That is the nudge to move
       up a ground, where the next floor pays the four its 15-25% again, the same "outgrowing a ground should show" the Glade's top is held to.
   One party cell per ground can't hold both ends (a cell keyed by the head's place in the band is a Systems change, PRIORITY_BOARD). */
const CLASS_OF_STYLE = Object.freeze({ tank: 'melee', sword: 'melee', axes: 'melee', hammer: 'melee', melee_dps: 'melee', bow: 'ranger', crossbow: 'ranger', ranger: 'ranger', mage: 'mage', healer: 'healer' });
/** A cell's comp ('tank+healer+bow+mage') holds all four classes; a comp naming a style this map doesn't know counts as well built (never skipped). */
export const wellBuiltFour = (m) => { const styles = String(m.comp || '').split('+'); return styles.some((x) => !CLASS_OF_STYLE[x]) || new Set(styles.map((x) => CLASS_OF_STYLE[x])).size >= 4; };
const fourRules = (min, max, why, whyReport) => [
  { id: 'four-xp', why, tiers: ['normal'], offsets: ['floor', 'middle', 'plus10'], sizes: [4], skip: (m) => !wellBuiltFour(m), metric: 'xpVsSolo', min, max, binding: true },
  { id: 'four-xp-report', why: whyReport, tiers: ['normal'], offsets: ['floor', 'middle', 'plus10', 'top'], sizes: [4], skip: (m) => wellBuiltFour(m) && m.offset !== 'top', metric: 'xpVsSolo', min, max, binding: false },
];
const FOUR_REPORT = 'designer 2026-11-13: a report line, the band top (a ground being outgrown) and a three-class four (its own cell by design, 10-31)';

export const SHEET = Object.freeze({
  source: 'local copy: balance ruling 2026-10-25 + rulings of record to 2026-11-07 (grade-sheet.mjs)',
  rules: Object.freeze([
    /* NORMAL IN RANGE IS SAFE (10-25 "Normal acceptance"; 11-04 "in range is safe") */
    { id: 'normal-deaths', why: '10-25: Normal, at most 1 death per 1,000 h', tiers: ['normal'], offsets: ['floor', 'plus10', 'top'], metric: 'deathsPer1000h', max: 1, pooled: true, binding: true },
    { id: 'normal-dips', why: '10-25: Normal, at most 1 serious dip under 25% HP per 12 h on average', tiers: ['normal'], offsets: ['floor', 'plus10', 'top'], metric: 'dipsPer12h', max: 1, pooled: true, binding: true },
    { id: 'normal-low-point', why: '10-25: Normal, the typical encounter bottoms out at 60-80% HP (diagnostic: a defensive hero may stay above)', tiers: ['normal'], offsets: ['floor', 'plus10', 'top'], metric: 'minHpP50', min: 60, binding: true },
    { id: 'normal-easy', why: '10-25: Normal is 60-80%, Easy 80-95% (Andy 11-06: "a cake walk")', tiers: ['normal'], offsets: ['floor'], metric: 'minHpP50', max: 80, binding: false },
    { id: 'normal-pace', why: '10-25 first-week bar: at the floor, at least half the pace of record (the pace is the ground the game sends a Level to, so a band top reads under it by design)', tiers: ['normal'], offsets: ['floor'], sizes: [1], metric: 'xpVsPace', min: 0.5, binding: true },
    /* NO PROFIT MOLDS (Tyler 2026-11-13): no rule grades gold. The +25% floor, the supplies share, under-the-floor-loses-gold and a party's gold
       against solo are RETIRED as rules; grade.mjs prints every ground's gold side by side (goldReport) and refuses a profit rule. */
    /* UNDER YOUR WEIGHT CLASS PAYS MORE XP (10-18, 11-06) */
    { id: 'under-pays-xp', why: '10-18 and 11-06: under your weight class pays more XP (an hour against the pace at that Level)', offsets: ['under5', 'under3', 'under2'], metric: 'xpVsPace', min: 1, binding: false },
    /* ABOVE THE BAND (10-18 "above range = low XP, small profit") */
    { id: 'above-low-xp', why: '10-18: past the band, the ground pays under the pace', offsets: ['above'], sizes: [1], metric: 'xpVsPace', max: 1, binding: false },
    /* PARTIES (10-25 §party: four 115-125, trio 110-120, duo 105-115 XP a head over a comparable solo) */
    ...fourRules(1.15, 1.25, '10-25: a well-built four earns 15-25% more XP a head than a comparable solo', FOUR_REPORT),
    { id: 'trio-xp', why: '10-25 (provisional): a trio 110-120', tiers: ['normal'], offsets: ['floor', 'plus10', 'top'], sizes: [3], metric: 'xpVsSolo', min: 1.1, max: 1.2, binding: false },
    { id: 'duo-xp', why: '10-25 (provisional): a duo 105-115', tiers: ['normal'], offsets: ['floor', 'plus10', 'top'], sizes: [2], metric: 'xpVsSolo', min: 1.05, max: 1.15, binding: false },
    /* TIERS (11-05: bigger pull, harder, more XP a kill, the same coin; 11-07: coin per kill never scales, "BUT NOT GOLD") */
    /* Coin per kill never scales (11-05, 11-07 "BUT NOT GOLD") is a rule on each monster, and a bigger pull moves the mix of monsters a
       cell kills, so a cell's coin per kill can't judge it: tests/hunt-core/hunt-tiers.mjs holds it on the data. */
    { id: 'tier-pays-more', why: '11-05: a harder tier that a party holds pays more XP an hour than the tier below', tiers: ['dangerous', 'deadly'], offsets: ['floor', 'plus10', 'top'], sizes: [3, 4], heldOnly: true, metric: 'xpVsTierBelow', min: 1, binding: true },
    { id: 'dangerous-deaths', why: '10-25 Hard band: 10-30 deaths per 1,000 h (a built party in range)', tiers: ['dangerous'], offsets: ['floor', 'plus10', 'top'], sizes: [3, 4], metric: 'deathsPer1000h', max: 30, pooled: true, binding: true },
    { id: 'deadly-deaths', why: '10-25 Extreme band: 50-100 deaths per 1,000 h (a built party in range)', tiers: ['deadly'], offsets: ['floor', 'plus10', 'top'], sizes: [3, 4], metric: 'deathsPer1000h', max: 100, pooled: true, binding: true },
  ]),
});

/**
 * The formula lane's src/data/balance-sheet.js BALANCE_SHEET (lane/b-ground-formula, 2026-11-07) read as grader rules, each line in
 * its own scope: Normal at the floor (lone, the 8 ways in the Level's gear), the fresh hero (practice set, first-day grounds), the
 * weight class (pairs 2-3 under read for XP; heroes alone 5 under are read for deaths), the harder tiers at the floor (whoever holds them, and a four's deaths on Deadly), the four against solo, the largest blows.
 * A line the sheet calls "a report line" is advisory; every other line is binding (off it, the grader exits 1).
 * NO PROFIT MOLDS (Tyler 2026-11-13): the sheet carries no gold line (its old marginMin, supplyShare and netMax are gone): gold is
 * printed per ground (grade.mjs goldReport), never graded.
 */
/* THE CONTRACT ON A TUTORIAL GROUND (designer 2026-11-13): a ground whose band middle is at or under LEVEL_PACE.early's Level is held by the
   tutorial's promise (Level 5 inside its hours, tests/level-curve.mjs C3), not by the contract fitted on the ladder, so its contract line reports.
   The Cellar (middle 5) reads 0.888x on the full grade; the one row step that lifts it walls Level 5 -> 6 (level-curve C6). */
const EARLY_LEVEL = 5;   // src/data/core-model.js LEVEL_PACE.early.level (tests/balance-grade.mjs holds the two equal)
export const contractIsEarly = (m) => Array.isArray(m.band) && Math.round((m.band[0] + m.band[1]) / 2) <= EARLY_LEVEL;
export { EARLY_LEVEL };

export function sheetFromBalanceSheet(BS) {
  const N = BS.normal, F = BS.freshHero, W = BS.weightClass, T = BS.tiers, P = BS.party;
  const floor1 = { tiers: ['normal'], offsets: ['floor'], sizes: [1] };
  const fresh = { ...floor1, gear: 'practice', floorMax: F.upToLevel, fit: 'solo', binding: true };
  const why = (s) => 'balance-sheet.js ' + s;
  return Object.freeze({
    source: 'src/data/balance-sheet.js BALANCE_SHEET (lane/b-ground-formula)',
    blows: BS.blows,
    rules: Object.freeze([
      { id: 'normal-deaths', why: why('normal.deathsPer1000h (RULED 10-25)'), ...floor1, metric: 'deathsPer1000h', max: N.deathsPer1000h, pooled: true, binding: true },
      { id: 'normal-dips', why: why('normal.closeCallsPer12h (RULED 10-25)'), ...floor1, metric: 'dipsPer12h', max: N.closeCallsPer12h, pooled: true, binding: true },
      { id: 'normal-low-point', why: why('normal.typicalMinHpPct, every way (RULED 10-25)'), ...floor1, metric: 'minHpP50', min: N.typicalMinHpPct, binding: true },
      { id: 'normal-xp-contract', why: why('normal.xpVsContract at the band middle, the median lone way on every ground (the contract is fitted on lone heroes)'), tiers: ['normal'], offsets: ['middle'], skip: contractIsEarly, aggregate: 'xpVsContract', min: N.xpVsContract.min, max: N.xpVsContract.max, binding: true },
      { id: 'normal-xp-contract-early', why: why('normal.xpVsContract, a report line on a tutorial ground (band middle at or under LEVEL_PACE.early, whose promise level-curve C3 holds; designer 2026-11-13)'), tiers: ['normal'], offsets: ['middle'], skip: (m) => !contractIsEarly(m), aggregate: 'xpVsContract', min: N.xpVsContract.min, max: N.xpVsContract.max, binding: false },
      { id: 'fresh-deaths', why: why('freshHero.deaths, the practice set at a first-day floor'), ...fresh, metric: 'deaths', max: F.deaths },
      { id: 'fresh-dips', why: why('freshHero.closeCalls'), ...fresh, metric: 'dips', max: F.closeCalls },
      { id: 'fresh-low-point', why: why('freshHero.typicalMinHpPct'), ...fresh, metric: 'minHpP50', min: F.typicalMinHpPct },
      { id: 'fresh-pace', why: why('freshHero.xpVsPaceMin'), ...fresh, metric: 'xpVsPace', min: F.xpVsPaceMin },
      { id: 'wc-normal-under', why: why('weightClass.normalUnder (a report line): 2-3 under earns more XP a head than the floor hero'), tiers: ['normal'], offsets: ['under2', 'under3'], sizes: [2], metric: 'xpVsFloorSolo', min: W.normalUnder.xpVsFloorMin, binding: false },
      /* OUTSIDE YOUR WEIGHT CLASS, RESTATED (designer ruling 2026-11-10, PRIORITY_BOARD "2026-11-10 Rulings" 1). Tyler 11-06: "you're gonna
         waste money but get more exp and possibly die a few times". Wasting money is the promise, so gold is the binding line, for the same
         pairs as before. Dying is "possibly", so no binding line asks a group to die: `wc-deadly-under-dies` (every pair, a death in the
         sample) is retired. It was red on four staged grounds for a tank and Healer pair that lost 19.4k g an hour a head and held.
         Deaths are read where they happen, on heroes alone five under (a report line): at most half the ways to fight alone hold.
         The gold line (wc-dangerous-under, wc-deadly-under-loses) is RETIRED by Tyler's 2026-11-13 NO PROFIT MOLDS: printed, never graded. */
      { id: 'wc-under-lone-dies', why: why('weightClass (a report line, designer 2026-11-10): alone and 5 under on a harder tier, at most 4 of 8 ways hold the sample with no death'), tiers: ['dangerous', 'deadly'], offsets: ['under5'], sizes: [1], aggregate: 'heldCount', max: 4, binding: false },
      /* ONE DIFFICULTY FOR EVERY GROUP (RULED 2026-11-08): no line asks a group size to fare a set way; each judges what the tier pays whoever
         holds it at the floor (no death in the cell), the same way on Normal beside it, and the one ceiling, a four at the floor holding Deadly. */
      { id: 'tier-dangerous-xp', why: why('tiers.dangerous.xpVsNormalMin, held at the floor, any group, against the same way on Normal'), tiers: ['dangerous'], offsets: ['floor'], heldOnly: true, metric: 'xpVsNormal', min: T.dangerous.xpVsNormalMin, binding: true },
      { id: 'tier-deadly-xp', why: why('tiers.deadly.xpVsNormalMin, held at the floor, any group, against the same way on Normal'), tiers: ['deadly'], offsets: ['floor'], heldOnly: true, metric: 'xpVsNormal', min: T.deadly.xpVsNormalMin, binding: true },
      { id: 'tier-deadly-four-held', why: why('tiers.deadly.fourDeathsPer16hMax, a four at the floor'), tiers: ['deadly'], offsets: ['floor'], sizes: [4], metric: 'deathsPer16h', max: T.deadly.fourDeathsPer16hMax, binding: true },
      ...fourRules(P.fourVsSolo[0], P.fourVsSolo[1], why('party.fourVsSolo (RULED 10-25), a well-built four at the floor and middle'), why('party.fourVsSolo, ' + FOUR_REPORT)),
    ]),
  });
}
