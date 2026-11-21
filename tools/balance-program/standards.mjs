// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/standards.mjs — THE STANDARDS, AS DATA (balance program 50, Tyler 2026-11-21).
// The words and the reasons are docs/design/balance-program/50-standards.md. This file is what the grid harness
// (tools/balance-program/progression-grid.mjs) and tests/balance-guard.mjs read, so a band means one thing everywhere.
//
//   CLOCK          the 12 hunted hours a hero a day every duration is counted on (RULED 11-21, 10-25)
//   CHECKPOINTS    the 31 Levels from 1 to 400 every cell is measured at
//   STRETCHES      which Levels are OPEN, STAGED or PROJECTED content, and the label their numbers carry
//   PARTIES, TIERS the party sizes and their compositions; the three tiers
//   GEAR_STATES    LOW, MID and BIS as rules a kit builder applies to src/data (no hand-typed kit)
//   POWER_SOURCES  when each power source becomes obtainable, and the data row that says so
//   PACE_TABLE     Tyler's ruled Level / hunted-hours targets, with the proposed Level 400 row
//   BANDS          every band: what it reads, its target, its red line, its label, its owner domain
//   OTHER_STANDARDS the 28 dimensions the program never measured (X1..X28)
//   CHECKLIST      the 15 lines every system card answers on the frame (K1..K15)
//   GRID           the harness's cell fields, derived tables, runs and budgets
//   VERDICT_RULES  buff, nerf or redo: the thresholds the solver judges every system by (50-standards 10.4)
//   GUARD_MAP      the old guard lines (30-plan section E) and the band each becomes
//   GAPS           the 34 unmeasured places of the old plan, with the decisions, lanes and guard lines resting on each
//   DEATH_COST     the death penalty as ruled: 6% flat, no cap; a printed table
//   TYLER_CALLS    the 17 calls, each with what Tyler picked on 2026-11-21 and the bands it set
//
// Labels: RULED (Tyler) | PROPOSED (the auditor's, waiting for a ruling or evidence) | CITED | COMPUTED (arithmetic on data rows).
// A band whose `mode` is 'report' never fails a run. It turns 'red' in the lane that lands the change it guards.
// `lo` / `hi` are the target. `redLo` / `redHi` are the red line. null = no bound on that side.
//
// PURE ESM. Data and three pure helpers. Imports nothing. Nothing here is a combat number.
// Self-check: `node tools/balance-program/standards.mjs --check` (exit 0 = the tables are well formed).
// ════════════════════════════════════════════════════════════════════════

const F = Object.freeze;
const deep = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.values(o).forEach(deep); F(o); } return o; };

export const LABELS = F(['RULED', 'PROPOSED', 'CITED', 'COMPUTED']);
export const DOMAINS = F({ 21: 'combat', 22: 'endgame', 23: 'items', 24: 'economy', 25: 'social', 26: 'home', 27: 'retention', 28: 'platform' });

export const CLOCK = deep({
  huntHoursADay: 12, label: 'RULED', ruling: '2026-11-21, 2026-10-25',
  restHoursADay: 12, // every other instant rests 1:1 (hunt-sessions.js STAMINA): all the town time a hero has
  townHoursADay: { standard: 12, alsoPrintedAt: 4, label: 'RULED', ruled: '2026-11-21', call: 13 }, // a resting hero is always working; model.mjs still holds the real 2 to 6
  verifyOnServer: 'the stamina day (8 h then 4 h free, 12 h Premium, 0 refills) is COMPUTED from data rows; the harness plays it on the local world first',
  visitsADay: { free: 2, premium: 1, label: 'RULED', ruled: '2026-11-21', call: 12 }, // COMPUTED: an 8 h bar is 8 h then 4 h, twelve hours apart; a 12 h bar is one start
  ceilingHoursADay: 24, // six refills of 4 h (stamina-refill.js); each hour past 12 costs two refill hours
  hoursAWeek: 84, hoursAMonth: 360,
  realPlayers: 'calibrate rates an hour, never hours a day',
});

export const CHECKPOINTS = F([1, 3, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 88, 100, 110, 125, 145, 165, 185, 200, 225, 250, 275, 300, 325, 350, 375, 400]);
/* The 12 the release guard plays (the rest are the nightly's). */
export const GUARD_CHECKPOINTS = F([5, 10, 15, 30, 45, 60, 88, 110, 145, 185, 300, 400]);

export const STRETCHES = deep([
  { id: 'open', from: 1, to: 110, state: 'OPEN', label: 'MEASURED', how: 'the real engine on real rows' },
  { id: 'staged', from: 110, to: 185, state: 'STAGED', label: 'MEASURED, STAGED', how: 'the real engine with the staged rows opened (gear.mjs openAlso, uniques)' },
  { id: 'projected', from: 185, to: 400, state: 'PROJECTED', label: 'PROJECTED', how: 'the real engine on placeholder grounds: STAT_FORMULA monsters at the floor, contract pay, the projected gear line',
    regionLevels: 55, groundsARegion: 6, floorEvery: 9, gearBandEvery: 20 },
]);
export const stretchOf = (level) => STRETCHES.find((s) => level <= s.to) || STRETCHES[STRETCHES.length - 1];

export const PARTIES = deep([
  { size: 1, seats: [['warhammer']], note: 'the hammer is the unit; every way is also played at MID for parity (X19)' },
  { size: 2, seats: [['tank', 'mage'], ['ranger', 'healer']], pick: 'best', fromLevel: 5 },
  { size: 3, seats: [['tank', 'healer', 'mage']], fromLevel: 5 },
  /* THE FOUR SITS AS THE REAL FOUR SAT (the critical review's step 1, 2026-11-21; F-framework-audit section 5): the real Krell four was a
     hammer in front, then the bow, the mage and the healer, in that seat order, and took 69% / 1% / 1% / 28% of the damage. A shield tank in the
     front seat takes 94% whatever the order (measured, 2 seeds x 1 h at Levels 79 and 85), so the shield four is a lineup, not the standard */
  { size: 4, seats: [['warhammer', 'ranger', 'mage', 'healer']], fromLevel: 5 },
]);
export const TIERS = F(['normal', 'dangerous', 'deadly']);
export const SUPPLY = deep({ bar: 'played', ownShare: 0.25, ownFromLevel: 30, label: 'ASSUMED until the town model measures 12 rested hours' });

/* THE THREE GEAR STATES. Each field is an instruction to the kit builder (tools/balance-sim/gear.mjs options where one exists). */
export const GEAR_STATES = deep({
  low: {
    name: 'LOW: the arrival kit',
    idea: 'what a hero wears the day it enters a band, having bought nothing; also the player who never upgrades',
    ladder: { tierOffset: -1, only: 'all', underLevel15: 'start-kit' }, uniques: false, chest: false,
    jewelry: 'none', cloak: 'none', temper: { blows: 0, armor: 0 }, linings: 'none',
    skills: { vsCareerLine: -8, fullFromLevel: 30, zeroAtLevel: 10 }, ammo: 'store-basic', projectedSources: false,
  },
  mid: {
    name: 'MID: the kit the game hands you',
    idea: 'wears what drops and spends a little',
    ladder: { tierOffset: 0 }, uniques: true, chest: false,
    jewelry: 'plain, highest wearable tier', cloak: 'plain', temper: { blows: 2, armor: 2 }, linings: 'none',
    skills: { vsCareerLine: 0 }, ammo: 'tier', projectedSources: false,
  },
  bis: {
    name: 'BEST IN SLOT',
    idea: 'everything that exists and can be worn at that Level; gold, luck and time do not limit it',
    ladder: { tierOffset: 0 }, uniques: true, chest: true,
    jewelry: 'highest tier, Hallmarked, the best perk pair for the way by measured XP', cloak: 'best', temper: { blows: 5, armor: 5 },
    linings: 'every socket, best tier for the Level, the element that answers the ground, to the 40% cap',
    skills: { vsCareerLine: 10, watchOnly: 'trains every rested hour (RULED 31-7: a number we watch, never a gate)' }, ammo: 'tier',
    projectedSources: true,
  },
});
export const GEAR_STATE_IDS = F(Object.keys(GEAR_STATES));

export const POWER_SOURCES = deep([
  { id: 'gear-tier', from: [1, 15, 30, 45, 60, 75, 88], row: 'src/data/gear-tiers.js MATERIAL_TIERS', state: 'live' },
  { id: 'unique-band', from: [110, 125, 145, 165], row: 'src/data/temper.js TEMPER_UNIQUE_BANDS; tools/balance-sim/staged/armor-line.js, weapon-line.js', state: 'staged' },
  { id: 'tempering', from: [15, 30, 45, 60, 75, 88], row: 'src/data/temper.js TEMPER_TIERS', state: 'live' },
  { id: 'tower-chest-weapon', from: [10, 40, 70, 100], row: 'src/data/chests.js CHEST_KEYS', state: 'live', weeklyOpensAHero: 6 },
  { id: 'catacomb-armor', keyTiers: [2, 4, 6, 7], row: 'src/data/catacomb-armor.js', state: 'staged', weeklyOpensAHero: 6 },
  { id: 'jewelry', from: [30, 45], row: 'src/data/jewelry.js JEWEL_TIERS', state: 'live', ruledNotBuilt: 'tiers 4 to 7' },
  { id: 'linings', from: [1, 30, 80], row: 'src/data/imbuements.js IMBUE_TIER_FLOORS', state: 'live' },
  { id: 'trained-skills', from: [10], row: 'src/data/training.js', state: 'live' },
  { id: 'perks-12-seats', budgetXp: 0.04, state: 'ruled', label: 'PROJECTED' },
  { id: 'worn-in', budgetXp: 0.02, state: 'ruled', label: 'PROJECTED' },
  { id: 'necrotic-storm', budgetXp: 0.10, state: 'ruled', label: 'PROJECTED' },
  { id: 'faction-skills', budgetXp: null, state: 'ruled', label: 'PROJECTED', note: 'ruled to matter (31-8), sized on nothing: gap 32' },
  { id: 'two-attribute-chest', from: [200], state: 'ruled', label: 'PROJECTED' },
  { id: 'projected-gear-band', from: 185, every: 20, state: 'projected', label: 'PROJECTED' },
]);

/* Tyler's Level table (2026-10-25 section 2; src/data/core-model.js LEVEL_PACE.targets), [Level, hunted hours]. Days = hours / 12. */
export const PACE_TABLE = deep({
  ruled: [[10, 6], [25, 36], [50, 168], [100, 600], [200, 1680], [300, 3120], [500, 6720]],
  ruled400: [[400, 4580]], // RULED 2026-11-21 (call 2): today's curve at 1.00 x contract, and the geometric midpoint of the ruled 300 and 500
  tolerance: 0.10, redTolerance: 0.15,
  /* THE CLOCK (S-11, RULED 2026-11-21, option c): the MID four on Dangerous after its deaths, the tier an idle four keeps; read again before Early
     Access from real XP and the calibrated simulator. key: the grid's seat (grid-derive.mjs SEATS) */
  seat: { ruled: 'MID four on Dangerous, after its deaths', key: 'mid:4:dangerous', ruledOn: '2026-11-21', call: 'S-11 c', was: 'MID four on the hardest tier it holds (2026-11-21, call 1); before it the lone MID on Normal' },
  /* COMPUTED on this commit from LEVEL_CURVE and the contract (the harness re-derives; never read these as targets). */
  computedHoursAtContract: { 10: 6.4, 25: 44.6, 50: 147, 100: 600, 110: 714, 185: 1577, 200: 1748, 300: 2907, 400: 4580 },
});

const b = (id, group, on, where, lo, hi, redLo, redHi, label, owner, why, extra = {}) => ({ id, group, on, where, lo, hi, redLo, redHi, label, owner, why, mode: 'report', ...extra });

export const BANDS = deep([
  // ── pace ── `on`: the grid field or derived table the band reads. `where`: the cells it applies to.
  /* TALENTS (10-level-choices.md 8.4): PROPOSED ids, PROVISIONAL ranges. Read off the matrix's talent block (matrix-metrics.mjs talentRows) */
  b('TL1', 'talent', 'Level XP an hour, the fastest build / the suggested build, same seats', {}, null, 1.05, null, 1.08, 'PROPOSED', 21, 'a build is never worth a weapon step over a sensible one'),
  b('TL2', 'talent', 'Level XP an hour, the empty build / the suggested build', {}, 0.90, 0.97, null, null, 'PROPOSED', 21, 'ignoring Talents costs something real, never a tenth of the game'),
  b('TL3', 'talent', 'deaths a 1,000 hours on the hardest tier, every hero on Footing and Grit, MID four', { gear: 'mid', party: 4 }, 30, null, null, null, 'PROPOSED', 21, 'under 30 is the best-gear band (S6): Talents must not replace gear'),
  b('TL4', 'talent', 'builds within 3% of the best on Level XP an hour, same seats', {}, 2, null, null, null, 'PROPOSED', 21, 'one build alone at the top is a red: the sameness test'),
  /* band change 8 (12-balance-pass.md section 5, applied on S-11 c): graded on the Dangerous four from Level 100; Levels under it and the Deadly four
     with no death print as readings (GR-6 lets the four run ahead early) */
  b('P1', 'pace', 'hoursToLevel / PACE_TABLE', { seat: 'pace-seat', levels: [10, 25, 50, 100, 200, 300, 400], from: 100 }, 0.90, 1.10, 0.85, 1.15, 'RULED', 21, '2026-10-25 section 2; the seat is S-11 c (2026-11-21); band change 8', { ruled: '2026-11-21', call: 1 }),
  b('P2', 'pace', 'xContract', { gear: 'mid', party: 1, tier: 'normal', way: 'hammer' }, 0.95, 1.10, 0.85, 1.25, 'RULED', 21, 'the table\'s tolerance; old G1', { groundMean: true, note: 'read on the hammer at a ground\'s mean; other ways print and judge nothing (12-balance-pass.md section 5, row 6)' }),
  b('P3', 'pace', 'xp / mid', { gear: 'low', party: 1, tier: 'normal' }, 0.80, 0.90, 0.70, 0.95, 'PROPOSED', 23, 'one weapon step plus accessories and two rungs'),
  b('P4', 'pace', 'xp / mid', { gear: 'bis', party: 1, tier: 'normal' }, 1.10, 1.20, null, 1.25, 'RULED', 23, 'call 3', { ruled: '2026-11-21', call: 3 }),
  b('P5', 'pace', 'xp bis / xp low', { same: 'seat', tier: 'normal' }, null, 1.50, null, 1.60, 'PROPOSED', 23, 'one set of monsters must serve both; Normal only: on the harder tiers LOW is ruled to fail (S3.low, S4.low, G-5)'),
  b('P6.2', 'pace', 'xp a head / lone, same tier', { gear: 'mid', party: 2 }, 1.05, 1.15, null, null, 'RULED', 25, '2026-10-25 section 5', { dropped: 'GR-67, RULED 2026-11-21: one party size is never a target against another' }),
  b('P6.3', 'pace', 'xp a head / lone, same tier', { gear: 'mid', party: 3 }, 1.10, 1.20, null, null, 'RULED', 25, '2026-10-25 section 5', { dropped: 'GR-67, RULED 2026-11-21: one party size is never a target against another' }),
  b('P6.4', 'pace', 'xp a head / lone, same tier', { gear: 'mid', party: 4, fromLevel: 10 }, 1.15, 1.25, 1.00, null, 'RULED', 25, '2026-10-25 section 5', { dropped: 'GR-67, RULED 2026-11-21: one party size is never a target against another' }),
  b('P7.2', 'pace', 'xContract', { gear: 'mid', party: 2, tier: 'hardest-held' }, 1.2, 1.5, null, 1.7, 'RULED', 21, 'never played; the plan assumed 1.2 (call 8)', { ruled: '2026-11-21', call: 8, dropped: 'GR-67, RULED 2026-11-21: one party size is never a target against another' }),
  b('P7.3', 'pace', 'xContract', { gear: 'mid', party: 3, tier: 'hardest-held' }, 1.5, 2.0, null, 2.2, 'RULED', 21, 'never played; the plan assumed 2.0 (call 8)', { ruled: '2026-11-21', call: 8, dropped: 'GR-67, RULED 2026-11-21: one party size is never a target against another' }),
  b('P7.4', 'pace', 'xContract', { gear: 'mid', party: 4, tier: 'hardest-held', levels: [30, 185] }, 1.8, 2.5, 1.6, 2.6, 'RULED', 21, '2026-11-16, 21-4; old G3', { dropped: 'GR-67, RULED 2026-11-21: one party size is never a target against another' }),
  b('P8', 'pace', 'xContract', { gear: 'bis', party: 4, tier: 'deadly' }, null, 2.75, null, 2.9, 'RULED', 21, '30-2; old G4'),
  b('P9.dangerous', 'pace', 'xp / normal, same party', { holds: true, tier: 'dangerous', party: 4 }, 1.10, 1.25, 1.0, null, 'PROPOSED', 21, 'the tier rows: 1.10 a kill, a pull of 8'),
  b('P9.deadly', 'pace', 'xp / normal, same party', { holds: true, tier: 'deadly', party: 4 }, 1.30, 1.60, 1.10, null, 'PROPOSED', 21, 'the tier rows: 1.25 a kill, a pull of 8'),
  b('P10', 'pace', 'xp after deaths / the tier below', { holds: false, party: 4 }, null, 1.0, null, 1.0, 'RULED', 21, '2026-11-08: strong enough or not'),
  b('P11.early', 'pace', 'hours for a Level', { seat: 'new-player', levels: [1, 9] }, null, 2, null, 2.5, 'RULED', 27, '27-2; old G6'),
  b('P11.ten', 'pace', 'hours to Level 10', { seat: 'new-player' }, 5, 7, null, 7, 'RULED', 27, '27-2; old G6'),
  b('P11.smooth', 'pace', 'hours for a Level / the Level before', { levels: [1, 400] }, null, 2, null, 2, 'RULED', 21, 'LEVEL_PACE.smooth'),
  /* read at 15, not 12 (the progression review, 2026-11-21): the RULED table itself needs 10.8 hours a Level from 100 to 200 and 14.4 from 200 to 300
     ((3,120 - 1,680) / 100), so "a Level in every 12 hours to 300" contradicted the ruling it sits under */
  b('P12.to300', 'pace', 'hours for a Level', { seat: 'pace-seat', levels: [10, 300] }, null, 15, null, 16.5, 'PROPOSED', 27, 'a Level in a day and a quarter at most: the ruled table needs 14.4 h a Level from 200 to 300'),
  b('P12.to400', 'pace', 'hours for a Level', { seat: 'pace-seat', levels: [300, 400] }, null, 24, null, 24, 'PROPOSED', 27, 'a Level every two days at most'),
  b('P13', 'pace', 'event Level XP / all Level XP', { player: 'hunts the whole weekend' }, null, 0.05, null, 0.05, 'RULED', 27, '27-5'),

  // ── survival and death ──
  b('S1.low', 'survival', 'lowHpTypical', { gear: 'low', tier: 'normal', inBand: true }, 0.45, 0.70, 0.35, null, 'PROPOSED', 21, 'one band under the ruled Normal row'),
  b('S1.mid', 'survival', 'lowHpTypical', { gear: 'mid', tier: 'normal', inBand: true }, 0.60, 0.80, 0.50, null, 'RULED', 21, '2026-10-25 section 3'),
  b('S1.bis', 'survival', 'lowHpTypical', { gear: 'bis', tier: 'normal', inBand: true }, 0.75, 0.95, 0.65, null, 'PROPOSED', 21, 'the ruled Easy row'),
  b('S2.low', 'survival', 'deathsPer1000h', { gear: 'low', tier: 'normal', inBand: true }, null, 5, null, 10, 'PROPOSED', 21, 'an arrival must survive Normal', { sample: 'nightly-deaths' }),
  b('S2.mid', 'survival', 'deathsPer1000h', { gear: 'mid', tier: 'normal', inBand: true }, null, 1, null, 2, 'RULED', 21, '2026-10-25 section 3', { sample: 'nightly-deaths' }),
  b('S2.bis', 'survival', 'deathsPer1000h', { gear: 'bis', tier: 'normal', inBand: true }, null, 0.1, null, 1, 'PROPOSED', 21, 'the ruled Easy row', { sample: 'nightly-deaths' }),
  b('S3.mid', 'survival', 'lowHpTypical', { gear: 'mid', tier: 'dangerous', inBand: true, party: 4 }, 0.35, 0.60, 0.25, 0.70, 'RULED', 21, '2026-10-25 "Hard"', { reportOnly: 'the 2026-10-25 health row and the 2026-11-21 death count cannot both hold; S6 judges the tier on the death sample (12-balance-pass.md section 5, rows 2 and 3)' }),
  b('S3.bis', 'survival', 'lowHpTypical', { gear: 'bis', tier: 'dangerous', inBand: true, party: 4 }, 0.55, 0.75, 0.45, null, 'PROPOSED', 21, '', { reportOnly: 'the 2026-10-25 health row and the 2026-11-21 death count cannot both hold; S6 judges the tier on the death sample (12-balance-pass.md section 5, rows 2 and 3)' }),
  b('S4.mid', 'survival', 'lowHpTypical', { gear: 'mid', tier: 'deadly', inBand: true, party: 4 }, 0.15, 0.40, 0.10, 0.50, 'RULED', 21, '2026-10-25 "Extreme", kept by call 5', { ruled: '2026-11-21', call: 5, reportOnly: 'the 2026-10-25 health row and the 2026-11-21 death count cannot both hold; S6 judges the tier on the death sample (12-balance-pass.md section 5, rows 2 and 3)' }),
  b('S4.bis', 'survival', 'lowHpTypical', { gear: 'bis', tier: 'deadly', inBand: true, party: 4 }, 0.35, 0.50, 0.30, 0.55, 'RULED', 21, 'old G5', { reportOnly: 'the 2026-10-25 health row and the 2026-11-21 death count cannot both hold; S6 judges the tier on the death sample (12-balance-pass.md section 5, rows 2 and 3)' }),
  b('S5.low', 'survival', 'damageTaken / mid', { gear: 'low' }, 1.15, 1.35, null, 1.50, 'PROPOSED', 23, 'an armor step is 3 to 5% (RULED); measured 13 to 26% a tier early'),
  b('S5.bis', 'survival', 'damageTaken / mid', { gear: 'bis' }, 0.80, 0.90, 0.70, null, 'RULED', 23, 'call 3', { ruled: '2026-11-21', call: 3 }),
  /* DEATHS IN 1,000 HUNTED HOURS ON THE HARDER TIERS, the same count at every checkpoint (RULED 2026-11-21, call 5: a flat count, not XP lost).
     MID is the 10-25 ruling's Hard and Extreme rows. LOW and BiS are the auditor's numbers. Normal is S2. */
  b('S6.dangerous.low', 'survival', 'deathsPer1000h', { gear: 'low', tier: 'dangerous', inBand: true, party: 4 }, 60, 150, 40, null, 'PROPOSED', 21, 'an arrival should step down', { call: 5, sample: 'nightly-deaths' }),
  b('S6.dangerous.mid', 'survival', 'deathsPer1000h', { gear: 'mid', tier: 'dangerous', inBand: true, party: 4 }, 10, 30, 5, 45, 'RULED', 21, '2026-10-25 "Hard"; flat at every Level by call 5', { ruled: '2026-11-21', call: 5, sample: 'nightly-deaths' }),
  b('S6.dangerous.bis', 'survival', 'deathsPer1000h', { gear: 'bis', tier: 'dangerous', inBand: true, party: 4 }, 2, 10, null, 15, 'PROPOSED', 21, '', { call: 5, sample: 'nightly-deaths' }),
  b('S6.deadly.low', 'survival', 'deathsPer1000h', { gear: 'low', tier: 'deadly', party: 4 }, 200, null, 150, null, 'PROPOSED', 21, 'strong enough or not', { call: 5, sample: 'nightly-deaths' }),
  b('S6.deadly.mid', 'survival', 'deathsPer1000h', { gear: 'mid', tier: 'deadly', inBand: true, party: 4 }, 50, 100, 30, 150, 'RULED', 21, '2026-10-25 "Extreme"; flat at every Level by call 5', { ruled: '2026-11-21', call: 5, sample: 'nightly-deaths' }),
  b('S6.deadly.bis', 'survival', 'deathsPer1000h', { gear: 'bis', tier: 'deadly', inBand: true, party: 4 }, 10, 30, null, 45, 'PROPOSED', 21, '', { call: 5, sample: 'nightly-deaths' }),
  b('S7.mid', 'survival', 'share of 12 h Normal hunts that finish', { gear: 'mid', tier: 'normal', inBand: true }, 0.99, null, 0.97, null, 'RULED', 21, '2026-10-25 section 3', { sample: 'nightly-deaths' }),
  b('S7.low', 'survival', 'share of 12 h Normal hunts that finish', { gear: 'low', tier: 'normal', inBand: true }, 0.90, null, 0.80, null, 'PROPOSED', 21, '', { sample: 'nightly-deaths' }),
  /* THE DEATH RULES' OWN BAND (the progression review, 2026-11-21: a patch that halved the death loss moved 0 bands, because a 2 hour cell records almost
     no death and no band read XP after deaths). Derived, never counted: the hardest tier the MID four holds, its Level XP a head after deaths AT THE TOP OF
     THE RULED COUNT (S6's MID row: Dangerous 30, Deadly 100 in 1,000 hours) at the ruled cost (DEATH_COST), over the lone MID hero's on Normal. Under 1 a
     party that dies as often as the ruling says is slower than its heroes alone (RULED 11-16: a party stands at or over its heroes alone). */
  b('S11.blessed', 'death', 'xp a head after deaths at the ruled count, the hardest tier the four holds / the lone hero on Normal, every Blessing', { gear: 'mid', party: 4, levels: [5, 400] }, 1.0, null, 1.0, null, 'PROPOSED', 21, 'the death rules move this band and no other', { reader: 'the Blessing ladder (S-5) at the measured death count (12-balance-pass.md section 5, row 7)' }),
  b('S11.unblessed', 'death', 'the same with no Blessing', { gear: 'mid', party: 4, levels: [5, 400] }, 1.0, null, 1.0, null, 'PROPOSED', 21, 'a party that buys no Blessing', { reader: 'the Blessing ladder (S-5) at the measured death count (12-balance-pass.md section 5, row 7)' }),
  b('S10', 'death', 'Blessing set price in hours of net gold / hours it saves', { levels: [30, 400] }, null, 0.20, null, 0.35, 'PROPOSED', 24, '21-8 was sized against a death worth 7 to 27 hours'),

  // ── gold ── no band names a gold number not yet measured on this frame
  b('G-1', 'gold', 'netGold, checkpoint over the one before', { gear: 'mid', party: 1, tier: 'normal' }, 1.0, null, 1.0, null, 'RULED', 24, '24-2; old G7', { reportOnly: 'ruled 2026-11-13: profit is reported, never graded (12-balance-pass.md section 5, row 5)' }),
  b('G-2.normal', 'gold', 'storeBill / coin', { gear: 'mid', tier: 'normal', inBand: true }, null, 0.15, null, 0.25, 'PROPOSED', 24, '', { reportOnly: 'ruled 2026-11-13: profit is reported, never graded (12-balance-pass.md section 5, row 5)' }),
  b('G-2.dangerous', 'gold', 'storeBill / coin', { gear: 'mid', tier: 'dangerous', inBand: true }, 0.25, 0.40, 0.15, 0.55, 'PROPOSED', 24, 'struggle or pay', { reportOnly: 'ruled 2026-11-13: profit is reported, never graded (12-balance-pass.md section 5, row 5)' }),
  b('G-2.deadly', 'gold', 'storeBill / coin', { gear: 'mid', tier: 'deadly', inBand: true }, 0.45, 0.65, 0.35, 0.80, 'PROPOSED', 24, 'REAL: 48% for the real four', { reportOnly: 'ruled 2026-11-13: profit is reported, never graded (12-balance-pass.md section 5, row 5)' }),
  b('G-3', 'gold', 'netGold / mid', { gear: 'low', tier: 'normal' }, 0.60, 0.85, 0.0, null, 'PROPOSED', 24, 'an arrival still earns its way to MID', { reportOnly: 'ruled 2026-11-13: profit is reported, never graded (12-balance-pass.md section 5, row 5)' }),
  b('G-4', 'gold', 'netGold a hero-hour', { gear: 'mid', party: 4, tier: 'deadly', levels: [50, 110] }, 3000, 8000, 0, null, 'RULED', 24, '30-5; old G8'),
  b('G-5', 'gold', 'netGold a hero-hour', { gear: 'low', tier: 'deadly', party: 4 }, null, 0, null, 0, 'RULED', 24, '2026-11-19: "wasting money"'),
  b('G-6', 'gold', 'netGold bis deadly / netGold mid dangerous', { same: 'party' }, 1.0, null, 1.0, null, 'PROPOSED', 24, 'the top kit turns the top tier into profit', { reportOnly: 'ruled 2026-11-13: profit is reported, never graded (12-balance-pass.md section 5, row 5)' }),
  b('G-8', 'gold', 'price / buyer net gold a 12 h day', { powerBearing: true }, null, 60, null, 90, 'PROPOSED', 24, 'small under 1 day, band goal 3 to 10, long goal 20 to 60'),
  b('G-9', 'gold', 'repeating sinks a day / gold in a day', { gear: 'mid', fromLevel: 30 }, 0.35, 0.50, 0.25, 0.65, 'PROPOSED', 24, 'the plan\'s dashboard promise', { retired: 'it read the store share as every repeating sink; no sink model exists (12-balance-pass.md section 5, row 4)' }),
  b('G-10', 'gold', 'standing prices of a band / the band\'s net gold', { gear: 'mid', party: 1 }, 1.2, 1.4, 1.2, 1.4, 'RULED', 24, '2026-11-18 "choose what matters"; old G15'),
  b('G-11', 'gold', 'server gold destroyed / created, a day', { serverAgeDays: 30 }, 0.85, 1.00, 0.70, null, 'PROPOSED', 24, 'CITED practice (verify)'),

  // ── gear ──
  b('E1.levels', 'gear', 'Levels between major upgrades', {}, 15, 25, 10, 30, 'RULED', 23, '2026-10-25 section 8'),
  b('E1.weapon', 'gear', 'hunting performance a weapon step', {}, 0.05, 0.08, 0.03, 0.10, 'RULED', 23, '2026-10-25 section 8'),
  b('E1.armor', 'gear', 'less damage an armor step', {}, 0.03, 0.05, 0.02, 0.08, 'RULED', 23, '2026-10-25 section 9'),
  b('E2.toKrell', 'gear', 'low to mid: share of band hours until every slot has dropped', { levels: [1, 110] }, null, 0.15, null, 0.25, 'PROPOSED', 23, '2026-11-20 generous to Krell'),
  b('E2.after', 'gear', 'low to mid: share of band hours until every slot has dropped', { levels: [110, 400] }, null, 0.35, null, 0.50, 'PROPOSED', 23, '2026-11-20 rare after'),
  b('E3', 'gear', 'low to mid: gold / the band\'s net gold', {}, null, 0.10, null, 0.20, 'PROPOSED', 23, 'MID is what the game hands you'),
  b('E4', 'gear', 'mid to bis: gold / the band\'s net gold', { party: 1 }, 1.0, 1.4, 0.8, null, 'RULED', 23, '2026-11-18'),
  b('E5.toKrell', 'gear', 'mid to bis: a source\'s median wait / the band\'s length, sources with no weekly limit', { levels: [1, 110], weeklyCapped: false }, null, 0.5, null, 1.0, 'RULED', 22, 'call 6: the weekly limits stay and are not judged here; fast players skip early chest pieces', { ruled: '2026-11-21', call: 6 }),
  b('E5.after', 'gear', 'mid to bis: a source\'s median wait / the band\'s length, sources with no weekly limit', { levels: [110, 400], weeklyCapped: false }, null, 1.0, null, 1.5, 'RULED', 22, 'call 6', { ruled: '2026-11-21', call: 6 }),
  b('E6.toKrell', 'gear', 'hunted hours between worn-set changes', { levels: [1, 110] }, null, 24, null, 36, 'PROPOSED', 23, 'something you wear changes every play day'),
  b('E6.after', 'gear', 'hunted hours between worn-set changes', { levels: [110, 400] }, null, 60, null, 90, 'PROPOSED', 23, ''),
  b('E7', 'gear', 'the Add pool, xp over the ladder kit', {}, null, 0.09, null, 0.10, 'PROPOSED', 23, 'the model\'s cap; old G10'),
  b('E8', 'gear', 'lone hours of gold a 1% of power, cheapest offer', {}, 1, null, 1, null, 'PROPOSED', 24, 'old G12'),

  // ── drops ──
  b('D1', 'drops', 'hunted hours a Very Rare, a hero', { levels: [1, 110] }, 60, 90, 45, 120, 'RULED', 23, 'Luck v3.1'),
  b('D2', 'drops', 'hunted hours a Very Rare, an own four', { levels: [110, 400] }, 60, 90, 45, 120, 'RULED', 23, '30-3'),
  b('D4', 'drops', 'Magic Find, every source', {}, null, 104, null, 104, 'RULED', 23, 'old G13'),

  // ── runway ──
  b('R1', 'runway', 'days a region opens ahead of the four MID player', {}, 14, null, 0, null, 'RULED', 22, 'call 7; 30 days at a launch', { ruled: '2026-11-21', call: 7 }),
  b('R2', 'runway', 'days of open and staged content at the Early Access launch, four MID (the pace seat reaching Level 185)', {}, 120, null, 90, null, 'RULED', 22, 'call 7; band change 8: staged content counts (27 open and 60 staged days on the old reading)', { ruled: '2026-11-21', call: 7 }),
  b('R3', 'runway', 'Levels authored a month / Levels the frontier gains a month', {}, 1.0, null, 0.8, null, 'PROPOSED', 28, 'the four gains about 69 a month past Level 110'),

  // ── server cost ──
  /* SERVER COST (RULED 2026-11-21, call 10 re-ruled: $0.15 an account-month at 1,000 accounts, no higher at 10,000). C2 is COMPUTED from it and 28-platform's ASSUMED
     list prices: one core carries 30,240 database-seconds a day (0.7 x 86,400 / 2). 1,000: $150 less about $80 of other lines = Medium ($60, 2 shared cores) = 60.
     10,000: $1,500 less about $1,015 = 2XL ($410, 8 cores) = 24. C1 = C2 / 48 hunted hero-hours. Today about 600; the four planned fixes about 190. */
  /* MM-26's CHECK G (06-mmo-layer.md: no buffed four holds a tier the plain four cannot enter). 12-balance-pass.md section 5 row 11 would drop it;
     that waits on Tyler (section 7, item 4), so it stays, report only. Read off the matrix's buff block (a buffed four on the hardest tier that holds
     where the plain one does not) */
  b('MM26.G', 'buff', 'buffed fours that hold a tier the plain four cannot enter', { party: 4 }, null, 0, null, 0, 'PROPOSED', 24, 'MM-26 check G', { reportOnly: 'fails by design on a cliff, waits on Tyler (12-balance-pass.md section 7, item 4)' }),
  b('C1.1k', 'cost', 'database seconds a hunted hero-hour, at 1,000 accounts', {}, null, 1.25, null, 1.5, 'COMPUTED', 28, 'C2.1k / 48', { reader: 'study 48\'s design numbers (48-platform-cost.md section 1, the 3.5-hour tab) (12-balance-pass.md section 5, row 9)' }),
  b('C1.10k', 'cost', 'database seconds a hunted hero-hour, at 10,000 accounts', {}, null, 0.5, null, 0.6, 'COMPUTED', 28, 'C2.10k / 48', { reader: 'study 48\'s design numbers (48-platform-cost.md section 1, the 3.5-hour tab) (12-balance-pass.md section 5, row 9)' }),
  b('C2.1k', 'cost', 'database seconds an account-day, four heroes at 12 h, at 1,000 accounts', {}, null, 60, null, 70, 'COMPUTED', 28, 'from the ruled $0.15 and 28\'s price list; old G16', { ruled: '2026-11-21', call: 10, reader: 'study 48\'s design numbers (48-platform-cost.md section 1, the 3.5-hour tab) (12-balance-pass.md section 5, row 9)' }),
  b('C2.10k', 'cost', 'database seconds an account-day, four heroes at 12 h, at 10,000 accounts', {}, null, 24, null, 30, 'COMPUTED', 28, 'from the ruled $0.15 and 28\'s price list', { ruled: '2026-11-21', call: 10, reader: 'study 48\'s design numbers (48-platform-cost.md section 1, the 3.5-hour tab) (12-balance-pass.md section 5, row 9)' }),
  b('C3', 'cost', 'journal rows a hero an hour an activity', {}, null, 1, null, 2, 'RULED', 28, '28-2', { reader: 'study 48\'s design numbers (48-platform-cost.md section 1, the 3.5-hour tab) (12-balance-pass.md section 5, row 9)' }),
  b('C4.1k', 'cost', 'dollars an account-month at 1,000 accounts', {}, null, 0.15, null, 0.15, 'RULED', 28, 'call 10, re-ruled: about $150 a month', { ruled: '2026-11-21', call: 10 }),
  b('C4.10k', 'cost', 'dollars an account-month at 10,000 accounts', {}, null, 0.15, null, 0.15, 'RULED', 28, 'call 10, re-ruled: no higher at 10,000', { ruled: '2026-11-21', call: 10 }),
  b('C4b.1k', 'cost', 'dollars a month that are not the database, at 1,000 accounts', {}, null, 80, null, 90, 'PROPOSED', 28, 'ASSUMED from 28\'s list prices at 3.3 h; re-read at 12 h'),
  b('C4b.10k', 'cost', 'dollars a month that are not the database, at 10,000 accounts', {}, null, 1015, null, 1100, 'PROPOSED', 28, 'ASSUMED from 28\'s list prices at 3.3 h; re-read at 12 h'),
  // ── the atlas (50-standards 10.1): read from tools/balance-program/atlas.json ──
  b('A1', 'atlas', 'items with no reachable source', {}, null, 0, null, 0, 'RULED', 23, 'CLAUDE.md 3.5; the data allows 55 today (UNREACHABLE_CEILING)'),
  b('A2', 'atlas', 'sources nothing uses', {}, null, 0, null, 0, 'RULED', 23, 'CLAUDE.md 3.5'),
  b('A3', 'atlas', 'reachable sources with no time cost', {}, null, 0, null, 0, 'PROPOSED', 23, 'an unmeasured source cannot be judged'),
  b('A4', 'atlas', 'MID sources inside the band\'s own grounds, a slot', { gear: 'mid' }, 1, null, 1, null, 'RULED', 23, '2026-10-23 gear at each zone threshold'),
  b('A5', 'atlas', 'kinds of piece in a BiS kit (dropped, crafted, won)', { gear: 'bis', fromLevel: 30 }, 3, null, 3, null, 'PROPOSED', 23, '2026-11-18 hunters and crafters need each other'),
  b('A6', 'atlas', 'slowest way / fastest way to one piece', {}, null, 3, null, 5, 'PROPOSED', 23, 'past that the slow way is a trap'),
  b('A7', 'atlas', 'skills with no product on a best path in a 15-level stretch', {}, null, 0, null, 0, 'RULED', 26, 'every skill has a consumer, read by level'),
  // ── the town on the 12 h day (10.2) ──
  b('T1', 'town', 'rested days from 1 to 99, a town skill', {}, 60, 120, 30, 180, 'PROPOSED', 26, 'outlasts a region, finishes inside a year'),
  b('T2', 'town', 'gold of a rested hour / a hunted hour', { gear: 'mid' }, 0.15, 0.35, 0.10, 0.60, 'PROPOSED', 26, 'the town matters and hunting stays the income'),
  b('T3', 'town', 'own supplies made in 12 rested hours / supplies used in 12 hunted', { gear: 'mid', inBand: true }, 0.25, 0.50, 0.10, 0.80, 'PROPOSED', 26, 'REAL: a third was home-made'),
  b('T4', 'town', 'share of the MID to BiS power gap that passes through a bench', {}, 0.25, 0.45, 0.15, 0.60, 'RULED', 23, 'call 15: it must matter', { ruled: '2026-11-21', call: 15 }),
  b('T5', 'town', 'days to full BiS with no bench / the best path', {}, null, 1.5, null, 2.0, 'RULED', 24, 'call 15: not the only way', { ruled: '2026-11-21', call: 15 }),
  b('T6', 'town', 'gold a day, a crafter only / a MID hunter', {}, 0.40, 0.70, 0.20, 1.00, 'PROPOSED', 26, 'a real way to play, never the best income'),
  b('T7', 'town', 'rested hours a day the best path wants', {}, 6, 12, null, 12, 'PROPOSED', 26, 'more than 12 means a town system is oversized'),
  // ── the best path (10.3): read from tools/balance-program/paths.json ──
  b('B1', 'path', 'days to full BiS / the band\'s length', { levels: [1, 110], party: 1 }, 0.7, 1.0, 0.4, 1.5, 'RULED', 23, 'call 14', { ruled: '2026-11-21', call: 14 }),
  b('B2', 'path', 'days to full BiS / the region\'s length', { levels: [110, 400] }, 1.0, 2.0, 0.7, 3.0, 'RULED', 23, 'call 14; rare after Krell', { ruled: '2026-11-21', call: 14 }),
  b('B3', 'path', 'days on the screen\'s advice / the solver\'s best', {}, null, 1.15, null, 1.30, 'PROPOSED', 27, 'nobody should need a guide'),
  b('B4', 'path', 'open grounds on no best path', {}, null, 0, null, 0, 'RULED', 22, 'DESIGN_STANDARDS 5'),
  b('B5', 'path', 'Levels a ground stays on the fastest-Level path past its band', {}, null, 10, null, 20, 'PROPOSED', 22, 'the next ground is under-paid'),
  b('B6', 'path', 'hunted hours to a goal, Premium / free', {}, 1.0, 1.0, 1.0, 1.0, 'RULED', 24, 'Premium sells comfort'),
  b('B7', 'path', 'pieces, rungs and tiers on a bought-gold path that are on no earned-gold path', {}, null, 0, null, 0, 'RULED', 24, 'call 11: no limit on how much sooner, only on what', { ruled: '2026-11-21', call: 11 }),
  b('B8', 'path', 'days to full BiS, 90th percentile / median', {}, null, 2.0, null, 3.0, 'PROPOSED', 23, 'beside X23'),
  b('B9', 'path', 'party path a head / the lone path', { fromLevel: 10 }, null, 1.0, null, 1.0, 'RULED', 25, '2026-11-16'),
  b('C5', 'cost', 'busy-hour CPU share at 1,000 accounts of four at 12 h, one database', {}, null, 0.70, null, 0.70, 'PROPOSED', 28, ''),
]);
export const bandById = (id) => BANDS.find((x) => x.id === id) || null;
/* THE DROPPED BANDS (GR-67): still in the table so a reader sees what was ruled away; nothing judges or prints them */
export const DROPPED = Object.freeze(BANDS.filter((b) => b.dropped).map((b) => b.id));
export const STANDING = Object.freeze(BANDS.filter((b) => !b.dropped));

const x = (id, name, verdict, band, computes, owner) => ({ id, name, verdict, band, computes, owner });
export const OTHER_STANDARDS = deep([
  x('X1', 'account shape', 'keep', 'the day each hero slot arrives at 12 h is printed from a played life', 'gold-model --slots at LOW, MID, BiS income', [24]),
  x('X2', 'account age', 'keep', 'at day 1, 30 and 180: a buy inside 10 days of gold and a chase inside 7 days', 'the account life by age', [27]),
  x('X3', 'server age and the newcomer', 'keep', 'a day-1 account on a day-180 server reaches MID at least as fast; old gear under 3 days of its gold', 'a newcomer life at market floor prices', [25, 24]),
  x('X4', 'who pays', 'keep', 'free reaches everything; Premium changes visits, never hours; a Crowns seller reaches BiS at most twice as fast', 'days to MID and BiS by payer', [24]),
  x('X5', 'who you hunt with', 'keep', 'own four and four friends within 10% a head; on-call never out-earns the owner\'s own hunt', 'one cell with 1, 2 and 4 accounts', [25]),
  x('X6', 'the stamina day', 'keep', '12 h free in two visits, Premium in one, 24 h with six refills; the first refill pays for itself everywhere', 'hours and net gold a day for 0 to 6 refills', [24]),
  x('X7', 'viewed against browser closed', 'keep (check)', 'identical by rule', 'the both-paths replay on 5 cells a night', [28]),
  x('X8', 'the death penalty by Level', 'keep', 'bands S6, S8, S9, S10', 'the death table and the death tax in every harder-tier cell', [21]),
  x('X9', 'away and back', 'keep', '8 h away loses nothing; 24 h at most half a day; 7 and 30 days lose no placement, stock or streak; under 3 minutes to all four hunting', 'hours lost and presses by gap', [27]),
  x('X10', 'session shape', 'keep', 'at most 2 visits free, 1 Premium, under 4 minutes for four heroes; zero repeated decisions', 'visits a day and presses a visit', [27]),
  x('X11', 'the chase by horizon', 'keep', 'hour, day, week, month and six months each name one on-screen goal', 'the reward log of a played life', [27]),
  x('X12', 'the longest dry spell', 'add', 'no reward gap over 0.5 h under Level 10, 2 h to 50, 6 h to 110, 12 h after', 'the longest gap in the reward log', [27]),
  x('X13', 'gear churn', 'keep', 'bands E1, E6', 'hours between worn-set changes by gear state', [23]),
  x('X14', 'economy health over time', 'keep', 'bands G-9, G-11; gold held stays under 20 days of income', 'the server gold model by age and population', [24]),
  x('X15', 'where old items go', 'add', 'every tier has a sink for at least 60% of its drops at day 180', 'pieces dropped against destroyed a day by tier', [23]),
  x('X16', 'runway against team throughput', 'keep', 'bands R1 to R3', 'the runway table and authored Levels a month', [22, 28]),
  x('X17', 'server cost and capacity', 'keep', 'bands C1 to C5', 'per-player-cost at 12 h and the 1,000 account run', [28]),
  x('X18', 'phone against desktop', 'keep (thin)', 'X10 met on a phone in landscape with the same presses', 'the press count on the sheet layout', [28]),
  x('X19', 'way-to-fight parity', 'add', 'every way within 1.5 of the median at MID; every role wanted in a four', 'every way at every checkpoint; the four with one seat swapped', [21]),
  x('X20', 'setup quality', 'add', 'the default bar reads at least 0.85 of the played bar to Level 30', 'default rules against the played bar at MID', [21, 27]),
  x('X21', 'town work at 12 rested hours', 'add', 'a town skill reaches 99 in 60 to 120 rested days; a third of supplies home-made inside rested hours', 'hours to 99 and stock a rested day', [26]),
  x('X22', 'weekly gates against a 12 h pace', 'add', 'no weekly cap is the only road to power inside a band under two weeks long', 'band lengths in weeks beside every weekly cap', [22]),
  x('X23', 'luck by percentile', 'add', 'every chance goal at the 10th, 50th and 90th percentile in days; the 90th at most 3 times the median for power', 'the percentile table', [23]),
  x('X24', 'ranks at equal hours', 'add', 'a board refills can buy says so or has a no-refill twin', 'the rank gap between a 12 h and a 24 h account', [27]),
  x('X25', 'many heroes, one owner', 'keep', 'an own four earns at most 4.4 times one hero a day; 4 heroes a hashed IP', 'account gold and items a day at 1 to 4 heroes', [24, 28]),
  x('X26', 'confidence', 'add', 'XP and gold on 2 seeds x 2 h or more; a death rate on 4 seeds x 8 h or more', 'the sample and spread beside every cell', [21, 22, 23, 24, 25, 26, 27, 28]),
  x('X27', 'harness against real play', 'keep', 'within 10% on XP and 20% on gold on three real parties (a lone hero, a pair, a four)', 'the calibration table', [21]),
  x('X28', 'teaching', 'keep', 'every system met under Level 30 is named on screen before it is needed', 'the blind-play list', [27]),
]);

export const CHECKLIST = deep([
  ['K1', 'purpose'], ['K2', 'where it sits in the progression'], ['K3', 'effect at LOW, MID and BiS'], ['K4', 'effect by party and tier'],
  ['K5', 'sources and sinks a day at 12 h'], ['K6', 'price in days'], ['K7', 'share of the day'], ['K8', 'the repeat check'], ['K9', 'scale'],
  ['K10', 'server cost at 12 h'], ['K11', 'exploit surface'], ['K12', 'teaching'], ['K13', 'telemetry'], ['K14', 'uniqueness'], ['K15', 'rulings'],
].map(([id, line]) => ({ id, line })));
export const VERDICTS = F(['keep', 'fix', 'merge', 'cut', 'unmeasured']);

/* BUFF, NERF OR REDO (50-standards 10.4): the solver's verdict on every system, source, ground, way, recipe, spell and item, new or existing.
   Any one test of a verdict trips it. Thresholds are PROPOSED (call 16). */
export const VERDICT_RULES = deep({
  label: 'RULED', ruled: '2026-11-21', call: 16,
  dominant: { action: 'nerf (or buff the others when they are under their own bands)', tests: {
    a: { on: 'share of gear slots it is the best route for, at a checkpoint', over: 0.50 },
    b: { on: 'the next route\'s time / its time, same goal', over: 1.5 },
    c: { on: 'share of best paths across party sizes', over: 0.60, checkpointsInARow: 3 },
    d: { on: 'its cost for another system\'s reward / that system\'s own cost', under: 0.50 } } },
  neglected: { action: 'buff to within 15% of the best on one goal, or cut', nearBest: 0.25, buffTo: 0.15,
    exempt: ['gold sink', 'cosmetic', 'social', 'teaching'], test: 'on no best path and no path within nearBest of the best, at any checkpoint, gear state or party size' },
  failsPurpose: { action: 'redo the system', tests: { a: 'fails checklist line K1', b: { on: 'checkpoints where a band it owns is red', atLeast: 3 }, c: { on: 're-tunes inside the program to stay in band', over: 2 } } },
  healthy: { action: 'keep', test: 'on a best path or within nearBest of one somewhere, and not dominant' },
  reportFields: ['system', 'verdict', 'ruleTripped', 'solverEvidence', 'gridEvidence', 'change', 'predictedResult', 'rulingsTouched'],
  neverCut: ['klappas_club', 'lucky finds'],
});
export const SOURCE_KINDS = F(['drop', 'boss', 'chest', 'bestiary-luck', 'shop', 'market', 'recipe', 'gather', 'farm', 'temper', 'hallmark', 'lining', 'event', 'task', 'planned']);

export const GRID = deep({
  out: 'tools/balance-program/progression-grid.json',
  axes: { checkpoints: 31, gear: 3, party: 4, tier: 3, fullCells: 1116 },
  cellFields: ['levelXp', 'xContract', 'mainSkillXp', 'coin', 'storeBill', 'netGold', 'damageTaken', 'healed', 'lowHpTypical', 'lowHpP10', 'deaths',
    'deathTax', 'killsAnHour', 'supplies', 'rareRows', 'seeds', 'hours', 'spread', 'contentState'],
  derived: ['hoursToLevel', 'gearRatios', 'hardestTierHeld', 'partyAndTierAdvantage', 'deathCost', 'gearCostAndTime', 'goldADay', 'accountLife', 'runway',
    'rewardLog', 'town', 'serverCost'],
  firstCheck: 'verify the stamina day on the server (tools/qa/local-world.mjs, 48 h, one free and one Premium hero, 12.0 hunted hours a day, 0 refills)',
  builders: ['kitFor(level, state, way)', 'the projector (placeholder grounds 185 to 400)', 'the town model (12 rested hours)'],
  runs: [
    { id: 'release', seeds: 2, hours: 1, cells: 120, budgetMin: 4, when: 'every release' },
    { id: 'nightly-grid', seeds: 2, hours: 2, cells: 1116, budgetMin: 60, when: 'nightly' },
    { id: 'nightly-deaths', seeds: 4, hours: 8, cells: 'a rotating third of the harder-tier cells', budgetMin: 60, when: 'nightly' },
  ],
  tools: {
    'sources.mjs': { out: 'tools/balance-program/atlas.json', budgetSec: 30, plays: false, bands: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'T1', 'T7'],
      reads: ['src/data/catalogue-coherence.js', 'monsters.js', 'grounds/*', 'loot-bands.js', 'chests.js', 'tower.js', 'bosses.js', 'boss-halls.js', 'bestiary.js', 'shops.js', 'recipes.js', 'gathering.js', 'temper.js', 'jewelry.js', 'imbuements.js', 'live-events.js', 'tally-tasks.js', 'tools/balance-sim/staged/*', 'progression-grid.json'] },
    'paths.mjs': { out: 'tools/balance-program/paths.json', budgetMin: 30, releaseBudgetMin: 1, search: 'beam by day (by the hour for two days), expected values, then 200 seeded runs for chance',
      goals: ['fastest Level', 'LOW to MID', 'full BiS', 'most gold a day', 'a town skill to 99'], for: { party: [1, 2, 3, 4], payer: ['free', 'premium', 'bought-gold'] },
      bands: ['T2', 'T3', 'T4', 'T5', 'T6', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'], reads: ['progression-grid.json', 'atlas.json'] },
  },
  budgetsAre: 'ASSUMED from 28\'s 5 to 9 s a point; the harness build measures and re-cuts them',
  /* A kit holds a tier when all three are true on the nightly sample (50-standards 2.3). */
  /* 12-balance-pass.md section 5 row 10 (ruled 2026-11-13: profit is reported, never graded): "net gold over zero" is dropped */
  holds: ['deathsPer1000h at or under the top of S6\'s MID row for the tier', 'lowHpTypical inside S3 or S4'],
});

export const GUARD_MAP = deep({ G1: 'P2', G3: 'P7.4', G4: 'P8', G5: 'S4.bis', G6: 'P11.ten', G7: 'G-1', G8: 'G-4', G9: 'X1', G10: 'E7', G12: 'E8', G13: 'D4',
  G15: 'G-10', G16: 'C2.1k', G18: 'X6' /* re-based to 12 h by lane/d-twelve-hours; now also reads the two-visit day */, G19: 'P7.2', G20: 'X1', G22: 'X6' });

const g = (n, gap, decisions, lanes, guard) => ({ n, gap, decisions, lanes, guard });
export const GAPS = deep([
  g(1, 'weeks and days counted at 3.3 hunted hours a day', ['30-1', '24-9', '31-5', '31-6', '26-3', '25-4', '24-10', '27-5', '31-2'], ['L06', 'L22', 'L42'], ['G9', 'G20']),
  g(2, 'G18 holds the Own four to 3.3 to 5.3 h a day', ['25-1'], ['L40'], ['G18']),
  g(3, 'on-call heroes spend idle stamina that does not exist at 12 h', ['25-1'], ['L40'], ['G18']),
  g(4, 'what Premium\'s bar and a refill are worth at 12 h', ['24-1', '24-3', '24-4', 'A-6', 'A-7'], ['L06', 'L27'], ['G22']),
  g(5, 'the yard sized on 14 to 20 idle hours', ['21-7', '24-8', '26-5', '26-10', 'A-4', 'A-5', '31-7'], ['L19'], ['G11', 'G12']),
  g(6, 'no LOW kit played past the start kit', ['21-1', '21-2', '21-3'], ['L15', 'L16'], ['G1', 'G5']),
  g(7, 'BiS is a product of other cells, never built or played', ['30-2', '23-5', '22-2', '22-3'], ['L29', 'L37', 'L52'], ['G4', 'G10']),
  g(8, 'MID has no rule: it is what recorded heroes wore', [], ['L14'], ['all']),
  g(9, 'eight reference points, none on a gear gate, none played past 175', ['A-10', '24-2', '24-11', '30-3'], ['L47', 'L56'], ['G1', 'G15']),
  g(10, 'the pair and the three are assumed', ['30-1', '24-9', '31-5'], ['L16'], ['G19']),
  g(11, 'Dangerous never a cell of its own', ['21-3'], ['L16'], ['G3', 'G5']),
  g(12, 'the Level table is on the lone hero; the four runs 2.2 times faster', ['21-4', '30-1', '30-2', '27-2'], ['L05', 'L16'], ['G1', 'G3']),
  g(13, 'the runway was read for an 8.4 h player', ['31-2', '30-7', 'A-10'], ['L47', 'L52', 'L56'], []),
  g(14, 'a death\'s cost read only to about Level 110', ['21-8'], ['L23'], []),
  g(15, 'two ruled death bands disagree and neither reads the cost of a death', ['21-3', '30-5'], ['L16'], ['G5']),
  g(16, 'Very Rares and Luck ruled in hours and read at 3.3 h', ['23-3', '30-3', 'A-9', '27-3', '30-4', '30-9'], ['L20', 'L34', 'L47'], ['G13']),
  g(17, 'weekly caps against bands that last 3 to 11 days', ['22-1', '22-2', '22-3', '22-5', '22-6'], ['L18', 'L29', 'L30'], ['G21']),
  g(18, 'Tempering\'s share sized on one hero; four share a purse', ['23-2', '24-11', '24-12'], ['L35'], ['G12', 'G15']),
  g(19, 'home-made supplies sized on 1.57 town hours a hunted hour', ['30-5', '25-8'], ['L16', 'L22', 'L32'], ['G8']),
  g(20, 'benches, farm, curing and rooms sized on the same town time', ['26-1', '26-2', '26-4', '26-7'], ['L09', 'L33', 'L38'], []),
  g(21, 'server-sized sinks sized on 3.3 h income', ['24-7', '24-10', '25-4', '25-6'], ['L06', 'L42'], []),
  g(22, 'server cost and capacity sized on a 3.3 h account', ['28-1', '28-2', '28-3', '28-5', '28-9', '30-7'], ['L11', 'L12', 'L13'], ['G16', 'G17']),
  g(23, 'the event share for a player who hunts the whole weekend', ['27-5'], ['L26'], []),
  g(24, 'the Bestiary\'s clock on the 12 h day', ['27-3'], ['L20'], []),
  g(25, 'the presses of a two-visit day never counted', ['27-1'], ['L07', 'L08'], []),
  g(26, 'boards at equal hours; whether a refill buys a rank', ['27-4', '24-1'], ['L26'], []),
  g(27, 'G20\'s target is a 3.3 h number', ['31-5', '31-6', '24-9'], ['L06'], ['G9', 'G20']),
  g(28, 'the Tower and the Catacombs at one Level and one kit', ['22-1', '22-4', '22-7', '30-8'], ['L18', 'L48'], ['G21']),
  g(29, 'scaled hunts at three Levels in one kit', ['22-9'], ['L31'], ['G24']),
  g(30, 'the spell audit at Levels 10 and 60 in one kit', ['32-1', '32-2', '32-3', '32-4', '32-5', '32-6', '32-7', '32-8', '21-5', '21-6', '21-10'], ['L17', 'L43', 'L44'], ['G2', 'G23']),
  g(31, 'the harness calibrated on one party on one day', [], ['L14'], ['K1']),
  g(32, 'faction skills ruled to matter, sized on nothing', ['31-8', '25-9'], ['L53'], ['G4']),
  g(33, 'account age, server age and the newcomer have no number', ['24-6', '24-7', '25-3'], ['L40', 'L41'], []),
  g(34, 'gold past tier 7 and the price index are formulas', ['24-2', '24-11'], ['L22', 'L47'], ['G15']),
]);

/* THE DEATH PENALTY (RULED 2026-11-21, call 4): 6% of all Level XP, flat, no cap in hours. A printed table, never a band.
   hoursUnblessed is COMPUTED on this commit at the contract rate (the grid re-derives); fully blessed is a quarter. */
/* CHECK C1, THE WEAPON CARDS' TAGS (08-player-experience.md section 6, TARGET; 13-build-plan.md D-1): each starting way, one hero, the start kit
   and the start bar, the Mill Cellar on Normal, reaches Level 5 in 15 to 20 hunted minutes with no death and net gold at or over zero. A way
   inside reads "Good alone"; a way outside carries "Slow alone" on its card or is fixed at the formula layer (the designer's call, D-1). Each
   card's ways are its STARTER_SETS row (src/data/start-kit.js); tools/balance-program/start-cards.mjs plays them */
export const START_CARDS = deep({ status: 'TARGET', source: '08 section 6, C1', minutes: [15, 20], deaths: 0, netGold: 0, toLevel: 5, ground: 'mill_cellar',
  cards: [['tank', 'Sword and shield', ['tank']], ['dual_axes', 'Hatchets', ['axes']], ['club', 'Club', ['hammer']], ['ranger', 'Bow and crossbow', ['bow', 'crossbow']],
    ['mage', 'Wand and spellbook', ['mage']], ['healer', 'Staff', ['healer']]] });
/* THE BLESSING LADDER (the sitting S-5, RULED 2026-11-21, option B): three Blessings, then a new one past the third whenever a blessed death would cost
   over about five hunted hours; MEASURED there at Levels 100, 185, 275 and 400 (60 G-7), each halving what a blessed death still takes */
export const BLESSING_LADDER = Object.freeze([100, 185, 275, 400]);
export const blessedShareAt = (L, blessings = 3) => (blessings >= 3 ? DEATH_COST.blessedShare * 0.5 ** BLESSING_LADDER.filter((x) => L >= x).length : null);
export const DEATH_COST = deep({ share: 0.06, cap: null, label: 'RULED', ruled: '2026-11-21', call: 4,
  hoursUnblessed: { 30: 2.0, 50: 5.1, 100: 21.7, 200: 56.8, 300: 89, 400: 148 }, blessedShare: 0.25,
  watch: 'XP an hour after deaths, every tier and gear state at every checkpoint: at the ruled Deadly death count a fully blessed MID party loses more than Deadly adds from about Level 105 (COMPUTED, not played). No band judges it' });

/* RULED 2026-11-21: recommended on every call except the ALTERNATIVE on 4, 5, 6 and 11. */
const PICKED_ALTERNATIVE = [4, 5, 6, 11];
export const TYLER_CALLS = deep([
  { n: 1, ask: 'whose clock is the Level table', recommended: 'the MID four on the hardest tier it holds', alternative: 'the lone MID hero, fours arrive in half the days', bands: ['P1', 'P12.to300', 'P12.to400', 'R3'] },
  { n: 2, ask: 'days to Level 400', recommended: '4,580 hunted hours, 382 days', alternative: '4,800 hours, 400 days', bands: ['P1'] },
  { n: 3, ask: 'how much better BiS is than MID', recommended: 'about 15% kill speed and 15% less damage', alternative: 'about 30% on both', bands: ['P4', 'S5.bis', 'P5'] },
  { n: 4, ask: 'what a death costs at high Levels', recommended: '6% capped at 48 h unblessed, 12 h fully blessed', alternative: '6% flat, no cap', bands: ['S10'] },
  { n: 5, ask: 'how often Deadly kills a MID party', recommended: 'the death tax: 6 to 12% of XP earned', alternative: 'a flat death count at every Level', bands: ['S6.dangerous.low', 'S6.dangerous.mid', 'S6.dangerous.bis', 'S6.deadly.low', 'S6.deadly.mid', 'S6.deadly.bis', 'S4.mid'] },
  { n: 6, ask: 'how long BiS takes', recommended: 'gold a bit over a band; timed pieces under half a band to Krell, a band after', alternative: 'keep weekly limits as they are', bands: ['E5.toKrell', 'E5.after', 'E4'] },
  { n: 7, ask: 'how far ahead content must be', recommended: '120 days at Early Access, 30 days ahead of the first fours', alternative: '60 days and a long chase with no new grounds', bands: ['R1', 'R2'] },
  { n: 8, ask: 'how much faster two and three heroes are', recommended: 'two 1.2 to 1.5, three 1.5 to 2.0', alternative: 'both near a lone hero, the jump at four', bands: ['P7.2', 'P7.3'] },
  { n: 9, ask: 'Luck on the 12 h clock', recommended: 'keep the hours: day 42 and month 14', alternative: 'stretch the far end to about three years', bands: [] },
  { n: 10, ask: 'what a player may cost', recommended: '$0.50 an account-month at 1,000, $0.30 at 10,000', alternative: 'another number, or size to the hardware', bands: ['C4.1k', 'C4.10k', 'C2.1k', 'C2.10k'],
    reRuled: '$0.15 an account-month at 1,000 accounts (about $150 a month) and no higher at 10,000' },
  { n: 11, ask: 'how much sooner bought gold gets you there', recommended: 'at most twice as fast to BiS', alternative: 'no limit on sooner, only on what', bands: ['B7'] },
  { n: 12, ask: 'two visits a day is the free game', recommended: 'yes, and the stamina bar says so', alternative: 'three visits free, so Premium is worth more', bands: [] },
  { n: 13, ask: 'do heroes work in town when they are not hunting', recommended: 'yes: size the town for all 12 rested hours, print it at 4 too', alternative: 'size the town on the real 2 to 6 hours', bands: ['T1', 'T7'] },
  { n: 14, ask: 'how long a full set of the best gear takes', recommended: 'about a band\'s length to Krell, one to two region lengths after', alternative: 'always two to three band lengths', bands: ['B1', 'B2'] },
  { n: 15, ask: 'how much crafting matters', recommended: 'a quarter to a half of the MID to BiS gap, and a non-crafter can buy it', alternative: 'under a tenth', bands: ['T4', 'T5'] },
  { n: 16, ask: 'when something is too strong or too weak', recommended: 'over half the slots or 1.5 times faster; never within a quarter of the best', alternative: 'twice as fast and within half', bands: [] },
  { n: 17, ask: 'may the audit put anything on the cut list', recommended: 'yes, one list to Tyler before any are built', alternative: 'things added in the last month get one more round', bands: [] },
].map((c) => ({ ...c, ruled: '2026-11-21', pick: c.reRuled ? 're-ruled' : PICKED_ALTERNATIVE.includes(c.n) ? 'alternative' : 'recommended' })));

/** Every problem with the tables, as strings. Empty = well formed. */
export function validate() {
  const out = [];
  const ids = new Set();
  for (const r of BANDS) {
    if (ids.has(r.id)) out.push('band id twice: ' + r.id); ids.add(r.id);
    if (!LABELS.includes(r.label)) out.push(r.id + ': label ' + r.label);
    if (!DOMAINS[r.owner]) out.push(r.id + ': owner ' + r.owner);
    if (r.lo == null && r.hi == null) out.push(r.id + ': no target');
    if (r.lo != null && r.hi != null && r.lo > r.hi) out.push(r.id + ': lo over hi');
    if (r.redLo != null && r.lo != null && r.redLo > r.lo) out.push(r.id + ': red line inside the target (low side)');
    if (r.redHi != null && r.hi != null && r.redHi < r.hi) out.push(r.id + ': red line inside the target (high side)');
    if (r.call != null && !TYLER_CALLS.some((c) => c.n === r.call)) out.push(r.id + ': call ' + r.call);
    if (r.where && r.where.gear && r.where.gear !== 'pace-seat' && !GEAR_STATE_IDS.includes(r.where.gear)) out.push(r.id + ': gear ' + r.where.gear);
    if (r.where && typeof r.where.tier === 'string' && r.where.tier !== 'hardest-held' && !TIERS.includes(r.where.tier)) out.push(r.id + ': tier ' + r.where.tier);
  }
  for (let i = 1; i < CHECKPOINTS.length; i++) if (!(CHECKPOINTS[i] > CHECKPOINTS[i - 1])) out.push('checkpoints not rising at ' + CHECKPOINTS[i]);
  if (CHECKPOINTS[0] !== 1 || CHECKPOINTS[CHECKPOINTS.length - 1] !== 400) out.push('checkpoints must run 1 to 400');
  if (CHECKPOINTS.length !== GRID.axes.checkpoints) out.push('GRID.axes.checkpoints');
  if (GRID.axes.fullCells !== CHECKPOINTS.length * GEAR_STATE_IDS.length * PARTIES.length * TIERS.length) out.push('GRID.axes.fullCells');
  for (const c of GUARD_CHECKPOINTS) if (!CHECKPOINTS.includes(c)) out.push('guard checkpoint not a checkpoint: ' + c);
  for (const [old, now] of Object.entries(GUARD_MAP)) if (now && !ids.has(now) && !OTHER_STANDARDS.some((s) => s.id === now)) out.push('GUARD_MAP ' + old + ' -> ' + now);
  for (const c of TYLER_CALLS) for (const id of c.bands) if (!ids.has(id)) out.push('call ' + c.n + ' names no band ' + id);
  OTHER_STANDARDS.forEach((s, i) => { if (s.id !== 'X' + (i + 1)) out.push('X ids out of order at ' + s.id); for (const o of s.owner) if (!DOMAINS[o]) out.push(s.id + ': owner ' + o); });
  GAPS.forEach((r, i) => { if (r.n !== i + 1) out.push('gap numbers out of order at ' + r.n); });
  if (CLOCK.huntHoursADay + CLOCK.restHoursADay !== 24) out.push('the day is 24 hours');
  return out;
}

/* `node tools/balance-program/standards.mjs --check` */
if (typeof process !== 'undefined' && process.argv && process.argv[1] && /standards\.mjs$/.test(process.argv[1]) && process.argv.includes('--check')) {
  const bad = validate();
  for (const line of bad) console.error('BAD  ' + line);
  const by = (k) => LABELS.map((l) => l + ' ' + BANDS.filter((r) => r.label === l).length).join(', ');
  console.log(`standards: ${CHECKPOINTS.length} checkpoints, ${GEAR_STATE_IDS.length} gear states, ${BANDS.length} bands (${by()}), ${OTHER_STANDARDS.length} other standards, ${CHECKLIST.length} checklist lines, ${GAPS.length} gaps, ${TYLER_CALLS.length} calls`);
  process.exit(bad.length ? 1 : 0);
}
