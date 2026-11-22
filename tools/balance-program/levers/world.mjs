// tools/balance-program/levers/world.mjs — levers of Tyler's categories 12 (monsters), 13 (spawn pacing and encounters), 14 (monster XP
// and loot values) and 19 (rare drops). Labels as in combat.mjs.
import { L, at, K, P, V, NP, flag, rows, home, field, fields, present } from './dsl.mjs';
import { KILL, SURVIVE, PACE, GOLD } from './combat.mjs';

const BS = 'src/data/balance-sheet.js';
const DZ = 'src/data/danger.js';
const MR = 'src/data/monster-roles.js';
const MON = 'src/data/monsters.js';
const MON_ROWS = home(MON + '#MONSTERS', 'keys');
const PACKS = home('src/data/grounds/*/pack.js#default', 'keys');
const GROUNDS = home('src/data/hunt-grounds.js#BASE_GROUNDS', 'keys');
const HUNTS = home('src/data/hunts.js#BASE_HUNTS', 'keys');

/* a monster row's stats: rows a formula roster writes against the hand rows (tools/balance-program/formulas/roster-drift.mjs's rule) */
const formulaVsHand = async (load) => {
  const { MONSTERS } = await load(MON);
  const { GROUND_ROSTER } = await load(BS);
  const rostered = new Set(Object.values(GROUND_ROSTER).flatMap((r) => Object.keys(r)));
  const ids = Object.keys(MONSTERS);
  return { table: MON + ' MONSTERS', rows: ids.length, formulaRows: ids.filter((id) => rostered.has(id)).length, handRows: ids.filter((id) => !rostered.has(id)).length,
    note: 'formulaRows sit on a GROUND_ROSTER and are written by formulaStats (tools/gen-ground-stats.mjs); 70 of 72 equal the formula on hp/atk/aim/evasion/def, the two named in FORMULA_EXCEPTIONS differ (roster-drift.mjs). handRows are typed by hand' };
};
/* drop rows by band: how many, and the chance range */
const dropsByBand = (bands) => async (load) => {
  const { MONSTERS } = await load(MON);
  const rowsOf = Object.values(MONSTERS).flatMap((m) => m.drops || []).filter((d) => bands.includes(d.band));
  const ch = rowsOf.map((d) => d.ch).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return { table: MON + ' MONSTERS[*].drops', bands, rows: rowsOf.length, distinct: new Set(ch).size, low: ch[0] ?? null, high: ch[ch.length - 1] ?? null };
};
const packField = (k) => async (load) => {
  const { GROUND_PACKS } = await load('src/data/grounds/index.js');
  const hits = GROUND_PACKS.filter((p) => p[k]);
  return { table: 'src/data/grounds/*/pack.js', packs: GROUND_PACKS.length, carrying: hits.length, values: hits.map((p) => p.id + ' ' + JSON.stringify(p[k].k ?? Object.fromEntries(Object.entries(p[k]).filter(([x]) => x !== 'why')))) };
};

export const WORLD = [
  /* ── 12. MONSTER HP, DAMAGE, ARMOR, RESISTANCES AND BEHAVIOR ──────────────────────────────────────────────────────────────── */
  L('mon.hp-line', 'monster-stats', 'global', 'Monster HP line', {
    at: [at(BS, 'hp: Object.freeze({ base: 4.95')],
    def: 'a formula monster\'s HP = (4.95 + 1.76 x L) x role.hp x fit (x the tier\'s hpPm in a fight)',
    range: 'above 0. Tyler 2026-11-19: monsters a little harder (+10% HP and damage the default step, 5 to 15% = slightly)',
    touches: 'kill time everywhere, and XP and coin a kill (priced per HP point on the same row)', out: [...KILL, 'takenPerH'], f: ['C-MON-STATS', 'E01', 'E23'],
    tests: [['tests/balance-sheet.mjs', 'the formula\'s stat lines'], ['tests/hunt-core/engine-parity.mjs', 'the rows the engine fields']], testReads: ['STAT_FORMULA', 'formulaStats'],
    perturb: K('monsterHp', 'a formula source: the matrix re-writes the monster rows (regen); hand rows do not move'),
    flags: [flag('contradictory', 'The sheet still says the engine scales monster HP 55 to 100% by party size; it has not since 2026-11-08', '44 X-STALE-HP-NOTE, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('mon.blow-line', 'monster-stats', 'global', 'Monster blow line and the gentle cap', {
    at: [at(BS, 'blow: Object.freeze({ lo: 0.132')],
    def: 'a regular\'s largest blow = a share of a same-Level hero\'s base HP: 13.2% on a gentle ground (floor 8 or under) to 22% from floor 16, and on a gentle ground never over 11% of the FLOOR hero\'s HP',
    range: 'shares 0..1. BALANCE_SHEET.blows: a regular\'s blow at most 30% of the hero, a boss\'s at most 35% of the floor hero',
    touches: 'damage taken, deaths, food bought', out: SURVIVE, f: ['C-MON-STATS'],
    tests: [['tests/balance-sheet.mjs', 'the blow shares and their ceilings']], testReads: ['STAT_FORMULA', 'BALANCE_SHEET'],
    perturb: K('monsterDamage', 'the knob scales lo, hi and gentleCap together'),
    flags: [flag('redundant', 'gentleCap 0.11 sits on top of the ramp\'s low end 0.132: two numbers for the gentle blow', '44 X-GENTLE-CAP, HYPOTHESIS until the grid shows the ramp alone holds the fresh hero')],
    ev: 'CONFIRMED (read)' }),
  L('mon.aim-evasion', 'monster-stats', 'global', 'Monster aim and evasion', {
    at: [at(BS, 'hit: Object.freeze({ lo: 0.40, hi: 0.70 })'), at(BS, 'heroHit: 0.85')],
    def: 'a monster lands 40% (gentle) to 70% (floor 16 on) on the reference hero; the reference hero lands 85% on it (its evasion), written through TO_HIT',
    range: 'chances 0..1, inside 5%..97%',
    touches: 'hit rates both ways', out: [...KILL, 'takenPerH'], f: ['C-MON-STATS', 'C-MON-TOHIT'],
    perturb: K('monsterAccuracy', 'heroHit is the knob heroAccuracy; both are formula sources (regen)', ['heroAccuracy']),
    ev: 'CONFIRMED (read)' }),
  L('mon.def', 'monster-stats', 'global', 'Monster armor and its cut', {
    at: [at(BS, 'def: Object.freeze({ perLevel: 0.08 })'), at('src/core/combat.js', 'monsterDefenseDamageReduction: 0.03')],
    def: 'def = 0.08 x Level x role.def; every blow and tick it takes loses floor(def x 0.03) whole points',
    range: 'above 0',
    touches: 'small hits on armored roles (heavy, elite, boss)', out: KILL, f: ['C-MON-DEF'],
    perturb: K('monsterDefense', 'the cut 0.03 is the knob monsterDefenseCut', ['monsterDefenseCut']),
    flags: [flag('contradictory', 'Two orders for one blow: the sheet, wiki and upgrade plan take the cut before the weakness; the engine rolls first, then subtracts', '44 X-SHEET-ORDER, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('mon.danger-ramp', 'monster-stats', 'exception-intentional', 'The gentle-ground ramp', {
    at: [at(BS, 'ramp: Object.freeze({ from: 8, to: 16 })')],
    def: 'a ground whose floor is 8 or under is gentle; a straight line to full danger at floor 16',
    range: 'from < to, Levels',
    touches: 'the first grounds\' safety', out: SURVIVE, f: ['C-MON-STATS'],
    perturb: P('a formula source (regen)'),
    flags: [flag('contradictory', 'A Level threshold that changes combat math; 44 asks for Tyler\'s explicit yes. Tyler S-15 a (2026-11-21) approved "gentle first grounds"', '44 X-DANGER-RAMP; rulings-of-record S-15')],
    ev: 'CONFIRMED (read)' }),
  L('mon.roles', 'monster-stats', 'archetype', 'Monster roles', {
    at: [at(BS, 'swarm: Object.freeze({ hp: 0.8'), at(BS, 'glass: Object.freeze({ hp: 0.75'), at(BS, 'heavy: Object.freeze({ hp: 1.2'), at(BS, 'elite: Object.freeze({ hp: 1.6'), at(BS, 'boss: Object.freeze({ hp: 5,')],
    def: 'swarm, regular, glass, heavy, elite, boss: multipliers on hp, hit, blow, def, evasion, xp, gp (boss hp x5, blow x1.1 held to 33% of the floor hero)',
    range: 'positive multipliers',
    touches: 'every formula monster\'s shape and pay', out: [...KILL, ...SURVIVE], f: ['C-MON-STATS'],
    tests: [['tests/balance-sheet.mjs', 'the roles']], testReads: ['MONSTER_ROLES'],
    perturb: P('a formula source (regen)'),
    flags: [flag('redundant', 'gentleHp on heavy and elite (1.0 and 1.2 where the role says 1.2 and 1.6): an XP and coin fix written into combat stats', '44 X-GENTLE-HP, HYPOTHESIS'),
      flag('contradictory', 'The boss blow is held to a third of the FLOOR hero\'s HP however deep he lives: a designer rule, never ruled by Tyler', '44 X-BOSS-FLOOR-CAP, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('mon.party-fit', 'monster-stats', 'exception-intentional', 'Party ground monster formula', {
    at: [at(BS, 'party: Object.freeze({ hp: 2.5')],
    def: 'a party ground\'s monsters: HP x2.5, blow x0.75, XP x0.8, to-hit -0.3 on a full box, coin x1.17 gentle / x0.53 full, the swing as fewer bigger blows (blowShape 1.6), no tier lift',
    range: 'positive',
    touches: 'party grounds (the Sewer, the Barrows ...)', out: [...KILL, ...SURVIVE], f: ['C-MON-STATS'],
    perturb: K('partyGroundHp', 'the blow is the knob partyGroundBlow; the other six numbers on the line are patches', ['partyGroundBlow']),
    flags: [flag('redundant', 'Three patches inside the fit (hitFull -0.3, blowShape 1.6, tierLift false) each compensate another formula', '44 X-PARTY-FIT-PATCHES, CONFIRMED'),
      flag('redundant', 'gp 1.17 and gpFull 0.53 stack on coin that is already per HP (HP x2.5): two compensating dials for one party coin share', '44 E-X05, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('mon.art-tier-scale', 'monster-stats', 'exception-accidental', 'Monster damage by art tier', {
    at: [at('src/core/combat.js', 'monsterAttackDamageScale: 5.4'), at('src/core/combat.js', 'monsterDamageScaleByTier: Object.freeze('), at(BS, 'export const DAMAGE_SCALE_BY_TIER')],
    def: 'a monster\'s largest blow = floor(atk x a scale picked by its ART tier: 5.4, 4.0, 3.0 or 2.2), written twice (combat.js and balance-sheet.js)',
    range: 'positive',
    touches: 'the damage of the 118 hand rows; nothing on formula rows (the formula divides the blow by the same number)', out: SURVIVE, f: ['C-MON-BLOW'],
    perturb: P('a patch on combat.js moves the hand rows only; on balance-sheet.js it moves the formula\'s rounding'),
    flags: [flag('redundant', 'Written twice; for the 72 formula rows it does nothing but rounding', '44 X-ART-TIER-SCALE, CONFIRMED'), flag('contradictory', 'A monster\'s damage depends on its art', '44 summary item 7')],
    ev: 'CONFIRMED (read)' }),
  L('mon.rows', 'monster-stats', 'content', 'A monster row\'s stats (formula rows and hand rows)', {
    at: [at(BS, 'export const FORMULA_EXCEPTIONS')],
    rows: rows('hp, atk, aim, evasion, def, level, speed on MONSTERS rows and the ground packs\' monsters', [MON_ROWS, PACKS], formulaVsHand, ['MONSTERS', 'GROUND_ROSTER']),
    def: 'every row carries hp, atk, aim, evasion, def, level. Rostered rows are the formula\'s (two named exceptions: the Rat King\'s attack 6 where the formula says 8, Hask\'s Lookout 88 where it says 113); hand rows are typed',
    range: 'TIER_BANDS (monster-classes.js) bound the hand rows by art tier (auditRoster)',
    touches: 'every fight on every ground', out: [...KILL, ...SURVIVE], f: ['C-MON-STATS', 'C-MON-BLOW'],
    tests: [['tests/hunt-core/engine-parity.mjs', 'the engine fields the rows']], testReads: ['MONSTERS', 'STAT_FORMULA'],
    perturb: P('a patch on a hand row\'s line; formula rows move only through the formula knobs (a hand edit is re-written by the regen)'),
    flags: [flag('redundant', '118 of 190 rows bypass the formula for no design reason; which of them a live hunt still fields is a HYPOTHESIS (53-review-world counts 103 unused)', '44 X-HAND-ROWS, CONFIRMED'),
      flag('contradictory', 'The Rat King\'s attack is held at 6 so his Tail Lash stays under 35% of the floor hero: the cap should bound his spell, not his attack', '44 X-NAMED-RAT-KING, CONFIRMED')],
    ev: 'CONFIRMED (read); counts by --write' }),
  L('mon.level-by-tier', 'monster-stats', 'exception-accidental', 'A Level from the art tier', {
    at: [at('src/data/core-model.js', 'export const MONSTER_LEVEL_BY_TIER = ')],
    def: 'a monster row with no Level gets 5 / 15 / 35 / 60 / 90 / 130 by art tier (Defense XP scales with it)',
    range: 'Levels',
    touches: 'only rows with no Level', out: [], f: ['C-MON-STATS', 'P07'],
    perturb: P(),
    flags: [flag('ineffective', 'If every fielded row has a Level this is dead', '44 X-LEVEL-BY-TIER, HYPOTHESIS (not checked)')],
    ev: 'CONFIRMED (read)' }),
  L('mon.behavior', 'monster-stats', 'content', 'Monster speed and reach', {
    at: [at(MON, 'const MONSTER_SPEED_DEFAULT = 3000'), at(MON, 'export const MONSTER_RANGE = ')],
    rows: rows('speed and range on MONSTERS rows', [MON_ROWS, PACKS], fields(field(MON, 'MONSTERS', 'speed'), field(MON, 'MONSTERS', 'range'))),
    def: 'a monster walks a tile in its row\'s speed (3,000 ms by default); a shooter (range 2..6) stands off and aims at the hero furthest back',
    range: 'speed ms above 0; range 2..6',
    touches: 'who takes damage (the back heroes against shooters), time between pulls', out: SURVIVE, f: ['C-TARGET', 'E12'],
    perturb: P(),
    ev: 'CONFIRMED (read)' }),
  L('mon.spells', 'monster-stats', 'content', 'Monster spells', {
    at: [at('src/data/monster-spells.js', 'export const MONSTER_SPELLS')],
    rows: rows('hitPm, cdMs, windupMs, range on MONSTER_SPELLS rows', [home('src/data/monster-spells.js#MONSTER_SPELLS', 'keys')], fields(field('src/data/monster-spells.js', 'MONSTER_SPELLS', 'hitPm'), field('src/data/monster-spells.js', 'MONSTER_SPELLS', 'cdMs'))),
    def: 'a spell rolls from half to all of floor(the caster\'s largest blow x hitPm / 1000), then the hero\'s armor; group, cone, ring, blast or line',
    range: 'SPELL_BOUNDS: range 1..6, windup 1,200..4,000 ms, cooldown 2,000..120,000 ms, hitPm 100..4,000',
    touches: 'damage taken, the healer\'s load', out: SURVIVE, f: ['C-MON-SPELL'],
    tests: [['tests/hunt-core/monster-spells.mjs', 'the spell engine']], testReads: ['MONSTER_SPELLS'],
    perturb: P(),
    flags: [flag('contradictory', 'Three spells had their multiples lowered so the +10% monster step would not pass 35% of a floor hero (Hot Coal, Bone Slide, Snuff the Candles): a bound written as three rows', '44 X-SPELL-HOLDS, HYPOTHESIS (rows not read)')],
    ev: 'CONFIRMED (read)' }),
  L('mon.spell-warning', 'monster-stats', 'global', 'A monster spell\'s warning and roll', {
    at: [at('src/data/monster-spells.js', 'export const FAIR_WARNING = '), at('src/data/monster-spells.js', 'export const SPELL_ROLL = ')],
    def: 'a windup of at least 1.2 s plus 0.4 s a tile of radius; the roll from 50%',
    range: 'ms above 0; permille 0..1000',
    touches: 'how often a spell lands', out: SURVIVE, f: ['C-MON-SPELL'],
    perturb: P(),
    flags: [flag('redundant', 'SPELL_ROLL.lowPm 500 is the hero spell\'s hitLowPm 500 written again', '44 X-ROLL-TWINS, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('mon.boss-phases', 'monster-stats', 'content', 'Boss phases', {
    rows: rows('phases on boss rows: addsPm, enragePm, enrageAtkPm, guardPm, cdPm', [MON_ROWS, PACKS], fields(field(MON, 'MONSTERS', 'phases.enrageAtkPm'), field(MON, 'MONSTERS', 'phases.guardPm'))),
    names: ['MONSTERS'],
    def: 'adds arrive at addsPm of his HP and he takes guardPm of every blow while one stands; under enragePm his atk and aim are x enrageAtkPm',
    range: 'permille',
    touches: 'boss fights (halls, called rooms, ground bosses)', out: SURVIVE, f: ['C-BOSS-PHASE'],
    perturb: P(),
    flags: [flag('ineffective', 'Elements, the enrage line, the guard and the adds read MONSTERS[kind] directly, past the row door a what-if uses, so a what-if can move a blow but not a phase', '44 X-ROW-DOOR-BYPASS, CONFIRMED (impact HYPOTHESIS)')],
    ev: 'CONFIRMED (read)' }),
  L('mon.leash', 'monster-stats', 'global', 'Leash margin', {
    at: [at('src/data/hunt-tuning.js', 'leashMarginDefault: 1')],
    def: 'a pack lives in its room plus 1 tile unless the ground says more; if the aggro holder leaves, it resets and heals',
    range: 'whole, 0 or more. The census cannot see it (1 is plain)',
    touches: 'pull size in open rooms', out: ['killsPerH', 'takenPerH'], f: ['C-LEASH'],
    perturb: P(),
    ev: 'CONFIRMED (read)' }),
  L('mon.tier-danger', 'monster-stats', 'archetype', 'Harder-tier blows', {
    at: [at(BS, 'dangerous: Object.freeze({ pull: 8, lift: 0.8'), at(BS, 'deadly: Object.freeze({ pull: 8, lift: 1')],
    def: 'Dangerous and Deadly: dmgPm 1170 and 1330 on atk, aim AND the monster\'s Level as armor reads it; lift 0.8 and 1 take back a gentle ground\'s kindness first',
    range: 'permille above 1000. Ruled direction: struggle or pay (2026-11-19); S-6 Deadly is a tier you watch or gamble on',
    touches: 'damage taken and deaths on harder tiers, and Defense XP', out: SURVIVE, f: ['C-TIER'],
    tests: [['tests/hunt-core/hunt-tiers.mjs', 'the tier rows'], ['tests/balance-sheet.mjs', 'the dials']], testReads: ['TIER_DIALS', 'tierRowFor'],
    perturb: K('tierDanger', 'shares its lines with tierHp, tierXp and tierPull'),
    flags: [flag('contradictory', 'Applied three times: to the blow, the aim and the Level armor reads. On Wickstead\'s Deadly a Level 8 monster counts as Level 21 against armor', '44 X-TIER-TRIPLE, CONFIRMED'),
      flag('ineffective', 'On the proposed game Dangerous and Deadly did nothing to a mid four (72 to 97% health on all 28 ground ends); the response is a cliff, a few percent of the dial between safe and a wipe', '12-balance-pass, MEASURED (R0, L, R2) on the proposed game')],
    ev: 'CONFIRMED (read), MEASURED (12)' }),
  L('mon.tier-hp', 'monster-stats', 'archetype', 'Harder-tier HP', {
    at: [at(BS, 'dangerous: Object.freeze({ pull: 8, lift: 0.8'), at(BS, 'deadly: Object.freeze({ pull: 8, lift: 1')],
    def: 'hpPm 1100 and 1150',
    range: 'permille 1000 or more',
    touches: 'kill time on harder tiers', out: KILL, f: ['C-TIER'],
    perturb: K('tierHp'),
    ev: 'CONFIRMED (read)' }),
  L('mon.tier-overrides', 'monster-stats', 'exception-accidental', 'Per-ground tier dials', {
    at: [at(BS, 'const BASE_TIER_OVERRIDES = ')],
    rows: rows('tierOverride in the packs', [PACKS], packField('tierOverride')),
    def: 'four base grounds carry their own tier dials (the Glade pulls 6 and HP 1400/1450, the Warrens HP 1150/1250, the Thicket XP 1050/1080, the Sewer HP 1150/1250 and XP 1220); packs carry tierOverride',
    range: 'permille',
    touches: 'those grounds\' harder tiers only', out: [...KILL, ...SURVIVE], f: ['C-TIER'],
    perturb: P(),
    flags: [flag('redundant', 'The exact case Tyler\'s formula brief names: each compensates kill reward on one ground; a formula fix at the kill reward lets every ground take TIER_DIALS whole', '44 X-TIER-PER-GROUND, CONFIRMED; knobs.json notKnobs')],
    ev: 'CONFIRMED (read)' }),
  L('mon.scaled-danger', 'monster-stats', 'exception-accidental', 'Scaled-hunt exceptions', {
    at: [at('src/data/scaled-hunts.js', 'export const SCALE_EXCEPTIONS')],
    def: 'a scaled Thicket reaches only half danger; grounds listed off the scale ladder by name',
    range: '0..1',
    touches: 'scaled hunts on those grounds', out: [], f: ['C-SCALED'],
    perturb: NP('not-in-runs'),
    flags: [flag('redundant', 'A per-ground combat number; the cause is the bow against a melee pack', '44 X-SCALED-THICKET and E-X12, CONFIRMED / HYPOTHESIS')],
    ev: 'CONFIRMED (read)' }),
  L('mon.run-rooms', 'monster-stats', 'exception-intentional', 'Tower and Catacomb rooms', {
    at: [at('src/data/tower.js', 'export const TOWER_RULES'), at('src/data/tower.js', 'export const CATACOMB_RULES')],
    rows: rows('the run grounds\' rooms and hunts', [home('src/data/hunt-grounds.js#TOWER_GROUNDS', 'open'), home('src/data/hunts.js#TOWER_HUNTS', 'keys')]),
    def: '5 monsters a floor at the formula\'s Level F, a Keeper every 10th; floor 3 min, landing 10 min; minLevel 10; the Tower\'s last row is floor 300',
    range: 'roomSize 2..8, heat 0..50 permille (validateTower)',
    touches: 'the run grounds', out: [], f: ['C-RUN-ROOM'],
    tests: [['tests/tower-climb.mjs', 'a climb']], testReads: ['TOWER_RULES'],
    perturb: NP('not-in-runs', 'tools/balance-sim/tower-climb.mjs plays climbs apart from the matrix'),
    flags: [flag('contradictory', 'The Tower heat (x1.012 a floor past 100, compounding to x10.9 by floor 300) is live; Tyler dropped it on 2026-11-20', '44 X-TOWER-HEAT, CONFIRMED'),
      flag('contradictory', 'A floor above 300 plays floor 300: a limit of the build, not a design choice, on an endless mode', '44 X-TOWER-TOP, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('mon.boss-rooms', 'monster-stats', 'exception-intentional', 'Boss room clocks (halls and called bosses)', {
    at: [at('src/data/boss-halls.js', 'limitMs: 10 * 60000'), at('src/data/boss-calls.js', 'limitMs: 10 * 60000')],
    rows: rows('the called bosses, their call items and hunts', [home('src/data/boss-calls.js#BOSS_CALLS', 'count'), home('src/data/boss-calls.js#CALL_ITEMS', 'open'), home('src/data/hunts.js#CALLED_HUNTS', 'keys')]),
    def: 'one fight, 10 minutes from the first swing, his kill ends it; a called room pays nothing, a keyed hall pays as a ground. GR-30 (PROVISIONAL, not built): the boss role times ONE hall number on health and so on this clock',
    range: 'ms above 0',
    touches: 'whether a party wins a hall', out: [], f: ['C-BOSS-ROOM'],
    perturb: NP('not-in-runs', 'no run plays a hall; the hall grader at Levels 25, 52 and 75 is owed (13-build-plan)'),
    flags: [flag('contradictory', 'GR-30\'s hall number acts on HP against a fixed clock, so a hall is won or lost at a DPS threshold: a cliff by construction, like the tiers. Nobody has sized a hall at Levels 25, 52 and 75', '02-world GR-30 PROVISIONAL; cliff COMPUTED from the rule, HYPOTHESIS until the hall grader plays it')],
    ev: 'CONFIRMED (read)' }),

  /* ── 13. SPAWN PACING AND ENCOUNTER COMPOSITION ────────────────────────────────────────────────────────────────────────────── */
  L('spawn.respawn', 'spawn', 'content', 'Pack respawn time', {
    rows: rows('respawnMs on ground rows and packs', [GROUNDS, PACKS, HUNTS], field('src/data/hunt-grounds.js', 'HUNT_GROUNDS', 'respawnMs'), ['HUNT_GROUNDS', 'BASE_GROUNDS']),
    def: 'a cleared pack is back ground.respawnMs after it was cleared (32 s to 90 s), never mid-fight',
    range: 'whole ms, a multiple of HUNT_TUNING.stepMs (validateGround)',
    touches: 'kills an hour once a party clears faster than packs return', out: ['killsPerH', 'levelXpPerH', 'netPerH'], f: ['E11'],
    perturb: P(),
    flags: [flag('ineffective', 'A hidden ceiling on kills an hour: past it a gear upgrade stops paying on that ground', '44 E-X34, HYPOTHESIS (report 69: two Level 45s cleared Wickstead faster than it respawned)'),
      flag('redundant', 'Written on the hunt row and on the ground row; the engine reads the ground\'s', 'CONFIRMED (pull-cycle.js reads inst.ground.respawnMs only)')],
    ev: 'CONFIRMED (read)' }),
  L('spawn.composition', 'spawn', 'content', 'Pockets, rosters and spawn weights', {
    rows: rows('pockets, spawns and their weights, densityMax, route, pullDist on grounds and packs', [GROUNDS, PACKS, HUNTS, home('src/data/hunt-grounds.js#CALLED_GROUNDS', 'keys')], fields(present('src/data/hunt-grounds.js', 'HUNT_GROUNDS', 'pockets.*.spawns.*.monster'), field('src/data/hunts.js', 'HUNTS', 'spawns.*.w')), ['HUNT_GROUNDS', 'pullRows']),
    def: 'a pull spawns its pocket\'s authored rows, then its non-boss fill rows again up to the density; packs on a route',
    range: 'densityMax 0..16 (DENSITY_PICK), a full box 8',
    touches: 'what a pull holds: roles, shooters, casters, bosses', out: [...KILL, ...SURVIVE], f: ['E10', 'C-PULL'],
    perturb: P(),
    ev: 'CONFIRMED (read)' }),
  L('spawn.density', 'spawn', 'global', 'Density bounds', {
    at: [at('src/data/hunt-grounds.js', 'export const DENSITY_FULL_BOX = 8'), at('src/data/hunt-grounds.js', 'export const DENSITY_PICK = ')],
    def: 'a full box is 8; a pick is clamped 0..16 and to the ground\'s densityMax; Normal is the room as built for every group (Tyler 2026-11-11)',
    range: 'whole',
    touches: 'pull size', out: [...KILL, ...SURVIVE], f: ['E10'],
    perturb: P(),
    ev: 'CONFIRMED (read)' }),
  L('spawn.tier-pull', 'spawn', 'archetype', 'Harder-tier pull size', {
    at: [at(BS, 'dangerous: Object.freeze({ pull: 8, lift: 0.8'), at(BS, 'deadly: Object.freeze({ pull: 8, lift: 1')],
    def: 'Dangerous and Deadly pull 8 (the Glade\'s Dangerous 6)',
    range: 'whole 1..16',
    touches: 'kills an hour and damage taken on harder tiers', out: [...KILL, ...SURVIVE], f: ['C-PULL', 'E13'],
    perturb: K('tierPull'),
    ev: 'CONFIRMED (read)' }),
  L('spawn.tier-pull-floor', 'spawn', 'exception-intentional', 'No bigger pull under floor 16', {
    at: [at(BS, 'export const TIER_PULL_FROM_FLOOR = 16')],
    def: 'under ground floor 16 a harder tier brings no more monsters',
    range: 'a Level',
    touches: 'early grounds\' harder tiers', out: KILL, f: ['C-PULL', 'E13'],
    perturb: P(),
    flags: [flag('contradictory', 'A deliberate rule of 2026-11-08 that conflicts with Tyler 2026-11-07 "Dangerous and Deadly keep the bigger pulls"', '44 X-TIER-PULL-FLOOR, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('spawn.between-pulls', 'spawn', 'global', 'Time between pulls', {
    at: [at('src/data/hunt-tuning.js', 'regroupMs: 1500'), at('src/data/hunt-tuning.js', 'regroupRadius: 7'), at('src/data/hunt-tuning.js', 'corpseMs: 10000')],
    def: 'regroup at least 1.5 s within 7 tiles; a corpse stays 10 s; travel at the hero\'s speed',
    range: 'ms and tiles, 0 or more',
    touches: 'kills an hour, regeneration between fights', out: ['killsPerH', 'levelXpPerH'], f: ['E12'],
    perturb: P(),
    ev: 'CONFIRMED (read)' }),
  L('spawn.gather-nodes', 'spawn', 'content', 'Gather nodes on hunting grounds', {
    at: [at('src/data/hunt-grounds.js', 'export const GROUND_NODE_KINDS')],
    rows: rows('gather on grounds and packs', [GROUNDS, PACKS]),
    def: 'trees and rocks on a ground: skill, level, XP, ms. The slider is inert until the hunt-gathering engine lands',
    range: 'n/a',
    touches: 'nothing today', out: [], f: [],
    perturb: NP('not-built', 'the hunt-gathering engine is not built'),
    flags: [flag('ineffective', 'Inert data (pack comments: "inert until the hunt-gathering engine lands")', 'CONFIRMED (read)')],
    ev: 'CONFIRMED (read)' }),

  /* THE DANGER SCALE (lane/v1-climb: probe V1, V1.1 and wave 1; 02 package 3, 04 sections 1, 5, 7 to 9). One integer step in place of the
     three tiers, a climb and a fall back read off each pull's lowest HP, pulls on readiness, pay by depth from the hours table. It plays only
     where a plan names a stance on a ground of DANGER_GROUNDS (Muster Barrows); no matrix RUN names one, so every row below is played by the
     probe (tools/balance-program/redesign/v1-climb.mjs, v2-stance.mjs), not by a cell. */
  L('danger.power-step', 'monster-stats', 'global', 'Danger power step', {
    at: [at(DZ, 'powerStep: 0.0035,')],
    def: 'each Danger step multiplies a pull\'s total HP and total blow by (1 + powerStep); a monster\'s aim and Level stay its row\'s, so the growth lands once on each',
    range: '0.25% to 0.5% (04 section 1: a gear tier must be felt, a company a tier behind must still hunt its ground). STATED 0.35%',
    touches: 'where a company holds on the scale (MEASURED V1: a Steady four at Level 60 on Muster holds ~590, +3 Levels +7 steps, a weapon band back -15 to -24)',
    out: [...KILL, ...SURVIVE], f: ['C-TIER', 'C-MON-STATS'],
    tests: [['tests/hunt-core/danger.mjs', 'scale: a pull\'s HP and blow grow by exactly (1 + powerStep) a step']], testReads: ['DANGER'],
    perturb: NP('not-in-runs', 'the V1 probe plays it (a patch of this line moves its held step); no matrix run plans a stance'),
    ev: 'MEASURED (v1-climb.mjs, 8 seeds x 12 h a cell, 2026-11-22)' }),
  L('danger.pull', 'spawn', 'global', 'Danger pull growth', {
    at: [at(DZ, 'pullStep: 0.00175,'), at(DZ, 'pullMax: 8,'), at(DZ, 'stepMax: 4000,')],
    def: 'about half of each step arrives as more monsters: the pull is the as-built mean x (1 + pullStep)^step, held to a full box (pullMax), each monster carrying the rest; no step past stepMax',
    range: 'pullStep 0 to powerStep (04 is silent on the split); pullMax a full box (DENSITY_FULL_BOX 8); stepMax keeps every number a safe float',
    touches: 'how many stand in a pull on the scale, so the kill rate and the coin a pull pays', out: KILL, f: ['C-PULL', 'E10'],
    tests: [['tests/hunt-core/danger.mjs', 'scale: no jump across a size change']], testReads: ['DANGER'],
    perturb: NP('not-in-runs', 'played by the V1 probe only'),
    ev: 'STATED (src/data/danger.js), CONFIRMED (read)' }),
  L('danger.readiness', 'spawn', 'global', 'Pulls on readiness', {
    at: [at(DZ, 'readyPm: 800,'), at(DZ, 'respawnMs: 15000,')],
    def: 'on the scale the party leaves its regroup only when every standing hero is at readyPm of max HP (HP only), and a cleared pack is back after respawnMs, so the pace is the party\'s',
    range: 'readyPm 1..1000 permille; respawnMs short enough that six pockets never wait on it (04 section 8)',
    touches: 'pace: damage taken costs time before it costs a life (04 section 9: slowing rest tenfold moved pace under 2% on the tiers)', out: [...KILL, ...PACE], f: ['E11'],
    tests: [['tests/hunt-core/danger.mjs', 'ready: the regroup waits for readyPm']], testReads: ['DANGER'],
    perturb: NP('not-in-runs', 'played by the V1 probe only'),
    ev: 'STATED, CONFIRMED (read)' }),
  L('danger.start', 'spawn', 'global', 'Danger start margin', {
    at: [at(DZ, 'startMargin: 20,')],
    def: 'a hunt opens startMargin steps under the LOWEST step any seated hero last held on that ground (0 for none); the server freezes it (1056-danger-scale.sql hr_danger_freeze)',
    range: 'whole steps, 0 or more. The doubling climb finds 20 steps in five clean pulls; V1\'s above cell lost heroes started at a stronger company\'s step',
    touches: 'the first minutes of a hunt on the scale: too small risks deaths at the open, too big pays the climb again', out: SURVIVE, f: ['C-TIER'],
    tests: [['tests/danger-db.mjs', 'DZ-1 and DZ-4: the start a margin under the lowest held step']], testReads: ['DANGER'],
    perturb: NP('sql-only', 'the server freezes the start; the probe plays a start by its own --start-from margin'),
    ev: 'STATED (the probe\'s --start-from margin)' }),
  L('danger.climb', 'spawn', 'global', 'The climb and the fall back', {
    at: [at(DZ, 'export const CLIMB = Object.freeze({ cleanRun: 2, climbMax: 8, fallSteps: 18, deathSteps: 120, coolPulls: 10 });')],
    def: 'cleanRun cleared clean pulls climb, each climb twice the last up to climbMax; a fall back is fallSteps down, a death deathSteps, then coolPulls pulls of steadying',
    range: 'whole steps and pulls. V1: a 6-step fall with no cool-down let Steady die (15 deaths in 8 days); 18 with 10 pulls of steadying none in 48',
    touches: 'how fast a company finds its edge and how far it falls; the server bounds a window\'s climb by it (hr_danger_bound)', out: SURVIVE, f: ['C-TIER'],
    tests: [['tests/hunt-core/danger.mjs', 'rule: the climb, the fall back, the cool-down']], testReads: ['CLIMB'],
    perturb: NP('not-in-runs', 'played by the V1 probe only'),
    ev: 'MEASURED (V1, V1.1: 12 seeds x 12 h x 4 cells)' }),
  L('danger.stances', 'monster-stats', 'archetype', 'Risk stance thresholds', {
    at: [at(DZ, "careful: Object.freeze({ fallPm: 450, cleanPm: 650, afterDeath: 'careful' }),"), at(DZ, "steady: Object.freeze({ fallPm: 250, cleanPm: 450, afterDeath: 'careful' }),"),
      at(DZ, "bold: Object.freeze({ fallPm: 120, cleanPm: 300, afterDeath: 'steady' }),")],
    def: 'a stance is its fall back trigger and its climb threshold, permille of max HP read on the lowest HP any hero reached in a pull; a death settles it one notch safer',
    range: 'fallPm < cleanPm <= 1000. RD-Q3 a: Careful and Steady never die, Bold is the only stance that can',
    touches: 'where a company holds and how often it dies: Steady 250/450 and Careful 0 deaths in 48 seed-days, Bold 120/300 0.4 to 1.1 deaths a day', out: SURVIVE, f: ['C-TIER'],
    tests: [['tests/hunt-core/danger.mjs', 'rule and breakoff: the trigger and the climb threshold']], testReads: ['RISKS'],
    perturb: NP('player-policy', 'the stance is the player\'s risk choice; the V1 and V2 probes play each'),
    ev: 'MEASURED (V1.1, v2-stance.mjs)' }),
  L('danger.pay', 'monster-rewards', 'global', 'Pay by depth', {
    at: [at(DZ, 'export const PAY = Object.freeze({ refKillsHead: 120, payStepXp: 0.007, payStepCoin: 0.007, gapMax: 120,')],
    def: 'a kill on the scale pays each hero (XP to its next Level / the hours that Level takes in the hours table) / (refKillsHead x heroes at the kill) x (1 + payStepXp)^gap, the gap the step over the ground\'s reference step held to gapMax; coin is the roll x the pull\'s share x (1 + payStepCoin)^gap',
    range: 'payStep = powerStep x a premium (04 section 7: 0.7% is a premium of two); refKillsHead the reference company\'s kills an hour a head at its reference step; gapMax 120 = at most 2.31x the table',
    touches: 'Level XP and coin an hour on the scale. MEASURED 2026-11-22 (2 seeds x 6 h, Muster): Steady at Level 60 0.72x the hours table over the hunt (the climb included), Bold 0.88x, Careful 0.28x; V1\'s row pay read ~22x',
    out: [...PACE, ...GOLD], f: ['P01', 'P02', 'C-TIER'],
    tests: [['tests/hunt-core/danger.mjs', 'pay: one kill at the reference step pays the hours table, a step deeper (1 + payStepXp) more, held at gapMax']], testReads: ['PAY'],
    perturb: NP('not-in-runs', 'played by the V1 probe only; the server bounds it (hr_danger_level_xp_max, 1055)'),
    ev: 'MEASURED (refKillsHead: v1-climb.mjs base:steady 481 kills an hour), STATED (gapMax)' }),
  L('danger.ref-step', 'monster-rewards', 'exception-intentional', 'A ground\'s reference step', {
    at: [at(DZ, 'muster_barrows: Object.freeze({ refStep: 590')],
    def: 'the step the reference company holds on a ground, where its pay is the hours table; a ground with no row does not open the scale (the server\'s hr_danger_grounds, 1055). The same row\'s floorStep / topStep (480 / 710 on Muster, 12-targets 3.1) cut the ground\'s band into DEPTHS for the player\'s "Depth N of 20": display only, the server reads refStep alone',
    range: 'whole steps. A bridge, not a per-ground dial: a step is of the ground\'s own rows until the bands are re-cut in one unit (wave 2), then it goes',
    touches: 'the absolute pay on that ground (each step off it is payStepXp)', out: PACE, f: ['P02'],
    tests: [['tests/hunt-core/danger.mjs', 'pay: Muster\'s reference step pays the table']], testReads: ['DANGER_GROUNDS'],
    perturb: NP('not-in-runs', 'played by the V1 probe only'),
    flags: [flag('redundant', 'A per-ground number that stands in for one absolute step unit (LR-1: no per-ground dial); it retires when grounds carry absolute bands', '02 package 3 cost; JUDGMENT')],
    ev: 'MEASURED (the Steady four at Level 60 held 589.5 +- 14, 2 seeds x 6 h)' }),
  L('danger.pay-floor', 'monster-rewards', 'global', 'Pay floor under the reference step', {
    at: [at(DZ, 'gapMax: 120, floor: 0.5 });')],
    def: 'under a ground\'s reference step the depth ratio a kill pays (XP and coin) falls to floor and no further, so a shallower stance pays in kills an hour, not twice (12-targets 2.1)',
    range: '0 to 1 of the hours table. 12-targets 2.1 starts it at 0.85 and rules "if Careful misses 0.55x to 0.70x of Steady, the floor moves, not the stances"',
    touches: 'Careful\'s pay an hour against Steady\'s (C-5); Steady and Bold hold near or over the reference, so it barely touches them', out: [...PACE, ...GOLD], f: ['P01', 'P02'],
    tests: [['tests/hunt-core/danger.mjs', 'pay: under the reference a kill pays the floor, never less']], testReads: ['PAY'],
    perturb: NP('not-in-runs', 'played by the V1 probe from a held start (lane/r9 tools/balance-program/redesign/r9); the server bounds only the most a kill pays (hr_danger_level_xp_max), which the floor never raises'),
    ev: 'MEASURED (lane/r9, v1-climb.mjs from a held start: tools/balance-program/redesign/r9/stance-held-L60.txt)' }),
  L('danger.power-gear', 'monster-stats', 'global', 'The power step on gear', {
    at: [at(DZ, 'export const POWER = Object.freeze({ weightGearPm: 1000 });')],
    def: 'on the scale a hero gear part (src/data/gear-steps.js: item Level x slot weight, a whole kit at X is X) counts weightGearPm / 1000 steps a gear step over the ground gearLevel: a blow at a monster x (1 + powerStep)^steps, a blow at the hero / (1 + powerStep)^steps, after the armor cap; heals are not stepped',
    range: '0 to 1000 permille (04 section 1: a weighted mean with weightSkill). 1000 makes a tier of base on a whole kit tierSteps steps of power by construction',
    touches: 'how far one gear tier moves the held step on the scale (C-2), on top of the own move of the shipped stats', out: [...KILL, ...SURVIVE], f: ['C-TIER', 'C-TEMPER'],
    tests: [['tests/hunt-core/danger.mjs', 'power: a tier of gear is a tier of steps, after the cap, never off the scale']], testReads: ['POWER', 'GEAR_STEPS', 'DANGER_GROUNDS'],
    perturb: NP('not-in-runs', 'played by the V1 probe (candidates power-tier-back / -ahead / -offense-back / -defense-back / -tier-back-under-cap); no matrix run plans a stance'),
    ev: 'MEASURED (lane/r9, v1-climb.mjs: tools/balance-program/redesign/r9/summary.txt)' }),
  /* MONSTER ROLES AND THE TWO ROWS (wave 2, lane/w2-roles-rows; 02 packages 3 and 4, 04 section 6). The Danger scale only. */
  L('roles.table', 'monster-stats', 'archetype', 'Monster roles (reach, range, splash, held, blow)', {
    at: [at(MR, "shooter: Object.freeze({ name: 'Shooter', reach: 'back', range: 5,"), at(MR, "caster: Object.freeze({ name: 'Caster', reach: 'back', range: 4, splash: Object.freeze({ r: 1, pm: 500 }),"),
      at(MR, "stalker: Object.freeze({ name: 'Stalker', reach: 'weakest', range: 0, heldPm: 500,")],
    def: 'a monster row names a role; on the scale its reach picks whom it aims at (front row nearest, back row farthest, the least max HP, the least crowded front hero) and keeps to it while no Challenge holds it; a Challenge holds it heldPm of its hold (absent: all); its largest blow is blowPm of its row (absent: all); a role with a range shoots from that many tiles on a row with none of its own; a splash lands pm permille of the blow on each hero within r tiles of the target',
    range: 'range 0 or MONSTER_RANGE (2 to 6); splash r 1 or more, pm 1 to 1000; heldPm and blowPm 0 to 1000. Content the designer owns (04 section 6: "six role rows"); the optimizer never moves it',
    touches: 'who takes the damage (V3: the front seat\'s share) and so which lineup holds deepest on a mix; MEASURED tools/balance-program/redesign/w2/summary.txt', out: [...SURVIVE, ...KILL], f: ['C-TIER'],
    tests: [['tests/hunt-core/monster-roles.mjs', 'reach, redive, range, splash, play']], testReads: ['MONSTER_ROLES'],
    perturb: NP('not-in-runs', 'played by the V1 probe with --styles (lineups) against the roles-off candidate; no matrix run plans a stance'),
    ev: 'MEASURED (lane/w2-roles-rows, v1-climb.mjs 8 seeds x 12 h a lineup, roles on and off)' }),
  /* ── 14. MONSTER XP AND LOOT VALUES ────────────────────────────────────────────────────────────────────────────────────────── */
  L('reward.xp-line', 'monster-rewards', 'global', 'Level XP a kill', {
    at: [at(BS, 'xp: Object.freeze({ a: 1.436')],
    def: 'XP a kill = max(2.534, 1.436 x L^0.4) x HP x role.xp x fit.xp x the ground\'s fit x floorFit (priced per HP point)',
    range: 'above 0. The pace contract (LEVEL_PACE.contract, a target) is what it is fitted to',
    touches: 'Level XP an hour everywhere', out: PACE, f: ['E01'],
    tests: [['tests/balance-sheet.mjs', 'the formula lines']], testReads: ['STAT_FORMULA'],
    perturb: K('xpPerKill', 'the Level exponent b is the knob xpByLevel; both are formula sources (regen)', ['xpByLevel']),
    flags: [flag('contradictory', 'No term for how fast a ground\'s monsters die, so every ground got a hand correction; the Level curve, the pace target and kill XP were then fitted to each other in a circle', '44 summary item 2, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('reward.tier-xp', 'monster-rewards', 'archetype', 'Harder-tier XP', {
    at: [at(BS, 'dangerous: Object.freeze({ pull: 8, lift: 0.8'), at(BS, 'deadly: Object.freeze({ pull: 8, lift: 1')],
    def: 'xpPm 1100 and 1250: Level XP a kill on Dangerous and Deadly',
    range: 'permille 1000 or more. BALANCE_SHEET: Dangerous at least 1.10 and Deadly 1.25 of Normal (targets)',
    touches: 'what a harder tier pays, so the reason to take the risk', out: PACE, f: ['C-TIER', 'E01'],
    tests: [['tests/hunt-core/hunt-tiers.mjs', 'the tier rows']], testReads: ['TIER_DIALS', 'tierRowFor'],
    perturb: K('tierXp'),
    ev: 'CONFIRMED (read)' }),
  L('reward.xp-floor-fit', 'monster-rewards', 'exception-accidental', 'Early-ground XP fit', {
    at: [at(BS, 'xp: Object.freeze({ a: 1.436')],
    def: 'xp.floorFit: XP a kill x0.67 on a ground whose floor is 8 or under, climbing to x1 at floor 32 (same line)',
    range: '0..1',
    touches: 'the first grounds\' pace', out: PACE, f: ['E01'],
    perturb: P(),
    flags: [flag('redundant', 'Falls away with the ground-fit fix (a kill reward that follows kills an hour)', '44 E-X04, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('reward.ground-xp-fit', 'monster-rewards', 'exception-accidental', 'Per-ground XP fit', {
    at: [at(BS, 'export const GROUND_XP_FIT')],
    rows: rows('xpFit in the packs', [PACKS], packField('xpFit')),
    def: 'a per-ground multiplier on XP a kill: 15 numbers from 0.76 to 1.22 (6 base grounds here, 9 packs)',
    range: 'positive',
    touches: 'each ground\'s pace', out: PACE, f: ['E01'],
    tests: [['tests/hunt-core/engine-parity.mjs', 'the rows carry the fit']], testReads: ['GROUND_XP_FIT'],
    perturb: P('a formula source (regen)', 'killRateRef'),
    flags: [flag('redundant', 'Outputs of the missing kill-rate term, hand-fitted (re-fitted 11-08, 11-11, 11-19); knobs.json lists it under notKnobs', '44 E-X01, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('reward.coin-line', 'monster-rewards', 'global', 'Coin a kill', {
    at: [at(BS, 'gp: Object.freeze({ perHp: 0.30')],
    def: 'mean coin = 0.30 x line x HP x role.gp x fit, rolled lo..2 x mean - lo; the line climbs x0.5 to x1.4 with the floor from 1 to 16, then is flat',
    range: 'above 0',
    touches: 'gold an hour (the main gold source)', out: GOLD, f: ['E23'],
    perturb: K('coinPerKill', 'a formula source (regen)'),
    flags: [flag('ineffective', 'Past floor 16 coin a HP point never moves again, while sinks are lists that end: from Level 110 gold only piles up', '44 E-X03 and summary item 4, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('reward.ground-gp-fit', 'monster-rewards', 'exception-accidental', 'Per-ground gold fit', {
    at: [at(BS, 'export const GROUND_GP_FIT')],
    rows: rows('gpFit in the packs', [PACKS], packField('gpFit')),
    def: 'x0.7 on coin and on what loot sells for, typed on 11 grounds (every ground from the Glade up)',
    range: '0..1',
    touches: 'gold an hour from the Glade on', out: GOLD, f: ['E23', 'E28'],
    perturb: P('a formula source (regen)', 'coinLine'),
    flags: [flag('redundant', 'One x0.7 typed 11 times and patched 3 more times in the shop\'s prices (the sale dial)', '44 E-X02 and E-X19, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('reward.row-xp-gp', 'monster-rewards', 'content', 'A monster row\'s XP and coin', {
    rows: rows('xp and gp on MONSTERS rows and packs', [MON_ROWS, PACKS], fields(field(MON, 'MONSTERS', 'xp'), field(MON, 'MONSTERS', 'gp.*'))),
    names: ['MONSTERS'],
    def: 'formula rows carry the formula\'s xp and gp pair; hand rows their own',
    range: 'positive',
    touches: 'pace and gold on each ground', out: [...PACE, ...GOLD], f: ['E01', 'E23'],
    perturb: P('formula rows are re-written from the formula; a hand row is a patch'),
    ev: 'CONFIRMED (read)' }),
  L('reward.common-drops', 'monster-rewards', 'content', 'Common and uncommon drop chances', {
    rows: rows('ch on common and uncommon drop rows', [MON_ROWS, PACKS], dropsByBand(['common', 'uncommon'])),
    names: ['MONSTERS'],
    def: 'one roll a row a kill (common over 15% a kill, uncommon 5 to 15%)',
    range: 'BAND_TARGETS bands; a chance is capped at 0.95',
    touches: 'sold-loot gold and materials an hour', out: GOLD, f: ['E44', 'E45'],
    perturb: P('the cell sells its loot (income); the drop rolls are played'),
    ev: 'CONFIRMED (read)' }),
  L('reward.drop-cap', 'monster-rewards', 'global', 'Drop chance cap', {
    at: [at('src/core/drops.js', 'return Math.min(0.95, row.ch * dropMult')],
    def: 'min(0.95, ch x the row\'s dropBonus x (1 + drop-rate buff) x featured); a 100% row is never multiplied',
    range: '0..1',
    touches: 'buffed drop rates', out: GOLD, f: ['E44'],
    perturb: P(),
    flags: [flag('ineffective', 'The featured multiplier is an argument nobody passes (the boss-of-the-day file 44 cites is gone from the tree)', '44 E-X27, CONFIRMED; src/core/botd.js absent on set')],
    ev: 'CONFIRMED (read)' }),
  L('reward.drop-bonus', 'monster-rewards', 'exception-accidental', 'Old-roster drop bonus', {
    rows: rows('dropBonus on MONSTERS rows', [MON_ROWS], field(MON, 'MONSTERS', 'dropBonus')),
    names: ['MONSTERS'],
    def: 'x1.15 drops on seven old-roster rows: the re-homed compensation for a retired `neutral` weapon class',
    range: 'positive',
    touches: 'those seven rows\' drops', out: GOLD, f: ['E44'],
    perturb: P(),
    flags: [flag('redundant', 'A row that should drop more can say so in its ch', '44 E-X14, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('reward.drop-band-fallback', 'monster-rewards', 'exception-accidental', 'Drop band fallback', {
    at: [at('src/core/drops.js', 'export const DROP_BAND_MAX = ')],
    def: 'a row with no band is banded by its odds (rare 5%, uncommon 15%)',
    range: '0..1',
    touches: 'which rows reveal', out: [], f: ['E45'],
    perturb: P(),
    flags: [flag('redundant', 'Two ways to know a row\'s band', '44 E-X16, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),

  /* ── 19. RARE-DROP PROBABILITIES ───────────────────────────────────────────────────────────────────────────────────────────── */
  L('rare.band-rows', 'rare-drops', 'content', 'Scarce, Rare, Key and Trophy drop chances', {
    rows: rows('ch on scarce, rare, key and trophy rows, and the reforge patterns\' boss drops', [MON_ROWS, PACKS, home('src/data/patterns.js#PATTERNS', 'open')], dropsByBand(['scarce', 'rare', 'key', 'trophy'])),
    names: ['MONSTERS', 'BAND_TARGETS'],
    def: 'each row\'s chance typed by hand until a test measures its hours inside its band (Scarce 0.75 to 1.5 h, Rare 10 to 20 h, Key 1.5 to 3 h, Trophy 100 to 150 h a hero at the floor)',
    range: 'BAND_TARGETS (a target table) and the 0.95 cap. Ruled 2026-11-20: generous to Krell, rarer after',
    touches: 'the gear chase, rare reveals', out: [], f: ['E46', 'E44'],
    tests: [['tests/hunt-core/drop-tables.mjs', 'each band row\'s measured hours inside its band']], testReads: ['BAND_TARGETS', 'MONSTERS'],
    perturb: P('the grid computes reveals an hour from the measured kills and the rows\' ch (cellRates revealEveryHeroH); not a matrix METRIC'),
    flags: [flag('redundant', 'Every chance is a hand-typed output of a measured hour; the band\'s hours on the row would derive it, as the Hearthfind already does', '44 E-X33, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('rare.hearthfind', 'rare-drops', 'content', 'Hearthfind odds', {
    at: [at('src/data/hearthfind.js', 'export const HEARTHFIND_TABLE')],
    rows: rows('hours and killsPerHour on HEARTHFIND_TABLE rows', [home('src/data/hearthfind.js#HEARTHFIND_HOURS_MAX', 'count')], field('src/data/hearthfind.js', 'HEARTHFIND_TABLE', 'hours')),
    def: 'oneIn = round(actions an hour x the row\'s authored hours, 100 to 400); kills an hour is a measured constant typed on each row; at most 3 finds a character a UTC day (SQL)',
    range: 'hours 1..400 (HEARTHFIND_HOURS_MAX)',
    touches: 'the trophy reveal moment', out: [], f: ['E15'],
    tests: [['tests/hearthfind-roll.mjs', 'the roll']], testReads: ['HEARTHFIND_TABLE', 'rollHearthfind', 'deriveOneIn'],
    perturb: NP('sql-only', 'the find is rolled against a generated server catalogue with a per-day clamp in SQL; no matrix metric reads it'),
    flags: [flag('redundant', 'killsPerHour is a measured constant typed on the row; it does not move when monsters do', '44 E-X39, CONFIRMED')],
    ev: 'CONFIRMED (read)' }),
  L('rare.chest-luck', 'rare-drops', 'global', 'Chest weapon chance: warmth and stokes', {
    at: [at('src/data/chests.js', 'warmthStepPm: 40'), at('src/data/chests.js', 'warmthCapPm: 3000')],
    rows: rows('the chance reader', [home('src/data/chests.js#chestChancePpm', 'count')]),
    def: 'min(1, weaponPm x warmth x stoke): warmth +4% a dry key up to x3; stokes x1.7 / 2.5 / 3.3 for 3 / 7 / 12 keys of Cinders',
    range: 'permille; stokes 1..9 rows (validateChests)',
    touches: 'the Hearth Chest\'s weapon chase', out: [], f: ['E49'],
    tests: [['tests/tower-chest.mjs', 'the chest odds']], testReads: ['CHEST_LUCK', 'chestChancePpm'],
    perturb: NP('outside-hunt', 'chests are opened in town'),
    ev: 'CONFIRMED (read)' }),
  L('rare.chest-keys', 'rare-drops', 'content', 'Chest keys and opens', {
    at: [at('src/data/chests.js', 'export const CHEST_KEYS'), at('src/data/chests.js', 'export const KEY_FAMILIES')],
    rows: rows('the key rows and the outfits\' odds', [home('src/data/chests.js#CHEST_OUTFITS', 'count')]),
    def: 'each key\'s weapon odds, tier, gold and food; 6 opens a week a family, 30 held at most; outfit odds a key',
    range: 'weaponTier 1..10 (validateChests)',
    touches: 'Tower and Catacomb rewards', out: [], f: ['E49'],
    perturb: NP('outside-hunt'),
    ev: 'CONFIRMED (read)' }),
  L('rare.bestiary-mults', 'rare-drops', 'exception-accidental', 'Bestiary drop and damage multipliers', {
    at: [at('src/data/bestiary.js', 'export const MAX_TROPHY_DROP_MULT'), at('src/data/bestiary.js', 'export const MAX_MEMORY_DROP_MULT'), at('src/data/bestiary-charms.js', 'export const MAX_CHARM_DROP_MULT'), at('src/core/member.js', 'const RELIC_MULT_MAX = 1.25')],
    rows: rows('drop and dmg on the charm ranks and trophy stages', [home('src/data/bestiary-charms.js#CHARM_RANKS', 'count'), home('src/data/bestiary.js#TROPHY_STAGES', 'count'), home('src/data/bestiary-charms.js#MAX_CHARM_DAMAGE_MULT', 'count'), home('src/data/bestiary.js#MAX_TROPHY_DAMAGE_MULT', 'count')]),
    def: 'charm ranks and trophy stages promise up to x1.03 drops and damage, the memory x1.07, a boss relic x1.25',
    range: 'above 1',
    touches: 'nothing on the hunt path', out: [], f: ['E51'],
    perturb: NP('dead', 'the charm damage ladder has no caller, trophy damage returns 1 while TROPHY_DAMAGE_ARM_ENABLED is false, relicMult is projected and never read'),
    flags: [flag('ineffective', 'Dead on the hunt path', '44 E51 and E-X26, CONFIRMED; trophies.js TROPHY_DAMAGE_ARM_ENABLED false'), flag('contradictory', 'Luck v3.1 (Tyler 2026-11-20) cuts the charm ladder; the rows remain', 'rulings-of-record LUCK v3.1')],
    ev: 'CONFIRMED (read)' }),
  L('rare.roll-fairness', 'rare-drops', 'global', 'Who takes a Rare in a party', {
    at: [at('src/data/party.js', 'rareRoll: Object.freeze({ sides: 100, maxRounds: 64 })')],
    def: 'highest of 1..100 among heroes who have not won since everyone last did, at most 64 rounds',
    range: 'whole',
    touches: 'who gets a Rare, not how many', out: [], f: ['E47'],
    perturb: P('the cells count rare wins a seat (rareWins) but no metric reads them'),
    ev: 'CONFIRMED (read)' }),
];
