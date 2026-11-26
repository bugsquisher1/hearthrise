#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/formulas/architecture-register.mjs — THE WHOLE-GAME FORMULA AND EXCEPTION REGISTER, DEDUPED (balance program 44,
// Tyler's formula-driven brief 40-formula-brief.md section 8 items 1 to 3 across the three categories). The ONE place the merges, the
// cross-category edges and the class 3 recommendations are written.
//
//   node tools/balance-program/formulas/architecture-register.mjs            the counts, and any merge that names a row that is not there
//   node tools/balance-program/formulas/architecture-register.mjs --write    writes formulas-architecture.json and the generated tables inside
//                                                                             docs/design/balance-program/44-formula-architecture.md, and reads each knob's
//                                                                             `value` in knobs.json from the tree again (a lane that moves a coefficient runs this)
//   node tools/balance-program/formulas/architecture-register.mjs --check    exit 1 when either is not what this file writes, or knobs.json no longer matches the tree (compared as
//                                                                             text: an LF and a CRLF checkout read the same)
//   node tools/balance-program/formulas/architecture-register.mjs --selftest plants CRLF, a changed row, a merge of a missing row and a class 3
//                                                                             row with no recommendation; exit 1 when a plant is not caught
//
// WHAT IT READS. The three category registers beside it (formulas-combat.json, formulas-progression.json, formulas-economy.json). It
// imports nothing from src/ and changes no game file. A row keeps its lane's class and its CONFIRMED or HYPOTHESIS mark. Where two lanes
// filed the same thing under different classes, the merge names the class it keeps and says why (DECIDED below): that is the only place
// a class moves.
// IDS. A combat row keeps its id (C-..., X-...). Progression and economy both number their exceptions X01..., so those become P-X01 and
// E-X01. A row this lane added from the design reviews is S-X...
// mutant-anchors: none — --selftest plants on in-memory texts, merge lists and a loaded copy of knobs.json; no tracked file is patched
// ci-step: economy-selftests | Formula architecture register - a bad merge, a class 3 row with no recommendation, a stale knob and a CRLF checkout are each caught
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/formulas/architecture-register.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const JSON_FILE = join(HERE, 'formulas-architecture.json');
const KNOBS_FILE = join(HERE, 'knobs.json');
export const KNOB_SCHEMA = 'hearthrise.balance-knobs/1';
const DOC_FILE = join(ROOT, 'docs', 'design', 'balance-program', '44-formula-architecture.md');
const SELF = 'tools/balance-program/formulas/architecture-register.mjs';
export const SCHEMA = 'hearthrise.formula-architecture/1';

/* LINE ENDINGS: this file writes LF; a checkout with core.autocrlf hands files back with CRLF, so every read goes through lf(). */
const lf = (s) => s.replace(/\r\n/g, '\n');
const read = (p) => (existsSync(p) ? lf(readFileSync(p, 'utf8')) : null);
const one = (v) => (Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v));
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

// ── the three registers, as one shape ───────────────────────────────────────
const CATEGORY = { combat: 'combat', progression: 'progression', economy: 'hunting and economy' };
export function loadLanes(dir = HERE) {
  const j = (n) => JSON.parse(lf(readFileSync(join(dir, 'formulas-' + n + '.json'), 'utf8')));
  const c = j('combat'), p = j('progression'), e = j('economy');
  const formulas = [
    ...c.formulas.map((f) => ({ id: f.id, lane: 'combat', what: f.computes, where: one(f.impl[0]), state: 'live' })),
    ...p.formulas.map((f) => ({ id: f.id, lane: 'progression', what: f.name + ': ' + f.computes, where: one(f.impl[0]), state: /not in the game/.test(f.name) ? 'unbuilt' : /projection/.test(f.name) ? 'tools only' : 'live' })),
    ...e.formulas.map((f) => ({ id: f.id, lane: 'economy', what: f.computes, where: one(f.impl[0]), state: f.status })),
  ];
  const st = (s) => (s === 'C' || s === 'CONFIRMED' ? 'CONFIRMED' : 'HYPOTHESIS');
  const exceptions = [
    ...c.exceptions.map((x) => ({ id: x.id, lane: 'combat', cls: x.class, status: st(x.status), what: x.what, where: one(x.where), fix: x.fix || '' })),
    ...p.exceptions.map((x) => ({ id: 'P-' + x.id, lane: 'progression', cls: x.class, status: st(x.status), what: x.what, where: one(x.where), fix: '' })),
    ...e.exceptions.map((x) => ({ id: 'E-' + x.id, lane: 'economy', cls: x.class, status: st(x.confidence), what: x.what, where: one(x.where), fix: x.fix || '' })),
  ];
  const edges = [
    ...c.edges.map((x) => [x.from, x.to]),
    ...p.edges,
    ...e.edges.inside,
  ];
  return { formulas, exceptions, edges, raw: { combat: [c.formulas.length, c.exceptions.length], progression: [p.formulas.length, p.exceptions.length], economy: [e.formulas.length, e.exceptions.length] } };
}

// ── THE FORMULA MERGES: [the id that stays, the ids that are the same formula in another lane, who owns which half] ─────────────
export const FORMULA_MERGES = [
  ['C-HERO-POWER', ['P13'], 'combat owns the expression. Progression owns what a skill level is worth'],
  ['C-SPELL-HIT', ['P14'], 'combat owns what a cast lands (also C-SPELL-HEAL, C-SPELL-SHELL, C-CAST-POWER). Progression owns what it trains'],
  ['C-REF-HERO', ['P36'], 'progression computes the career. Combat reads it. Past Level 1,000 its straight line overstates skill (375 at 5,000 against about 248): quote the played numbers of 42 section 7.2'],
  ['C-TIER', ['P24', 'E04'], 'one table, three readers: combat the damage and Level half, progression the XP dial, economy the pull as kill rate'],
  ['E01', ['P32'], 'hunting owns XP a kill. Progression reads it as an input'],
  ['P20', ['E03'], 'progression owns the split'],
  ['P21', ['E05'], 'progression owns the party table'],
  ['P23', ['E06'], 'progression owns the under-floor share'],
  ['C-SCALED', ['P26', 'E07'], 'combat owns the stats, progression the XP share, economy the hourly price'],
  ['P25', ['E08'], 'progression owns the mode share'],
  ['P06', ['E09'], 'progression owns the three skill XP routes (P06, P07, P08)'],
  ['C-MON-STATS', ['E02'], 'combat owns the HP line. XP and coin are priced per HP point on the same row, so a change to it is an XP and coin change the same day'],
  ['C-PULL', ['E13'], 'combat owns how many stand. Economy reads it as kill rate'],
  ['C-BASIC-BLOW', ['E19'], 'combat owns the blow, and a dry shot at x0.25 (src/core/ammo.js AMMO_DRY_MULT) is a multiplier on it that the combat inventory missed. Economy owns the bill'],
  ['E42', ['P10'], 'economy owns the fee'],
  ['E37', ['P29'], 'economy owns the price. Progression owns what a death costs'],
  ['C-JEWEL-PERKS', ['P18'], 'combat lands the perk. Economy prices the Hallmark (E40)'],
  ['E54', ['P34'], 'economy owns the Luck bar, unbuilt'],
  ['C-RUN-ROOM', ['P33'], 'combat owns a floor\'s monsters. Progression owns what a floor pays'],
  ['C-REGEN', ['P12'], 'combat owns regeneration. Progression owns the Inner Flame level it reads'],
  ['C-GEAR-WEAPON', ['P16'], 'combat owns what a piece carries (also C-GEAR-ARMOR). Progression owns the Level it is worn at (P35)'],
];

// ── THE EXCEPTION MERGES: { id that stays, also, and when the lanes disagreed on the class: cls + decided } ──────────────────────
export const EXCEPTION_MERGES = [
  { id: 'X-POWER-LITERALS', also: ['P-X23'] },
  { id: 'X-ART-TIER-SCALE', also: ['X-SCALE-TWINS', 'P-X22'] },
  { id: 'X-MEND-MAXHP', also: ['P-X39'] },
  { id: 'X-SPELL-FLOOR', also: ['P-X40'] },
  { id: 'X-TIER-PER-GROUND', also: ['P-X11', 'E-X08'] },
  { id: 'X-TIER-PULL-FLOOR', also: ['P-X13', 'E-X07'], cls: 3, status: 'CONFIRMED', decided: 'combat and economy filed it 3, progression 4 as a hypothesis. It is a deliberate rule of 2026-11-08 that conflicts with a ruling of 2026-11-07, so it is Tyler\'s to settle: 3. That it is unneeded stays a hypothesis' },
  { id: 'X-CELLAR-NORMAL-ONLY', also: ['P-X12', 'E-X09'] },
  { id: 'X-TOWER-HEAT', also: ['P-X16'] },
  { id: 'X-TOWER-TOP', also: ['P-X17'], cls: 4, decided: 'combat filed it 3, progression 4. Nobody designed "the Tower ends at floor 300": the server\'s bound is a generated table with a last row. A limit of the build, not a design choice: 4' },
  { id: 'P-X06', also: ['X-OTHER-LEVEL-SHARE', 'E-X10'] },
  { id: 'E-X01', also: ['P-X04', 'X-OTHER-GROUND-FITS'] },
  { id: 'E-X04', also: ['P-X05'] },
  { id: 'E-X11', also: ['P-X10'], cls: 3, decided: 'economy filed it 3 (the mode is approved, 2026-11-07), progression 4 (its XP share was re-dialed seven times). The mode is intentional: 3. Its numbers are outputs of the kill reward and get re-derived, not re-fitted' },
  { id: 'P-X09', also: ['E-X13'] },
  { id: 'X-PARTY-FIT', also: ['E-X06'], cls: 3, decided: 'combat filed it 2 (an encounter type in data), economy 3. It is a second set of stat coefficients picked by what kind of ground a monster lives on, and 53-review-world asks to remove it. A rule that changes the monster formula by ground needs Tyler\'s yes: 3' },
  { id: 'X-HAND-ROWS', also: ['E-X35'], cls: 4, status: 'CONFIRMED', decided: 'combat filed it 2, economy 4 as a hypothesis. The formula exists and 118 rows bypass it for no design reason: 4. Which of them a live hunt still fields stays a hypothesis (53-review-world counts 103 that no hunt uses)' },
  { id: 'X-CALLED-ROOM', also: ['E-X31'] },
  { id: 'P-X33', also: ['E-X24'] },
  { id: 'P-X20', also: ['E-X23'] },
  { id: 'X-LINE-IN-TOOLS', also: ['P-X32'], cls: 4, decided: 'combat filed it 4 (the formula sits in a tools folder), progression 2 (the gear rows are absent). One cause, one fix, at the formula layer: 4' },
  { id: 'P-X46', also: ['E-X21'] },
  { id: 'X-DUMMY', also: ['P-X29'] },
];

// ── ROWS THIS LANE ADDED (raised by the design reviews 52 and 55, checked or marked here) ───────────────────────────────────────
export const ADDED = [
  { id: 'S-X01', lane: 'synthesis', cls: 4, status: 'CONFIRMED', what: 'weaponResist is an authored column on monster rows that no engine code reads. The bestiary prints a resistance the fight does not apply', where: 'src/data/grounds/hasks_ford/pack.js:25,121 and four more packs, src/data/monsters.js', fix: 'formula layer: C-WEAKNESS reads it as the mirror of weaponWeak, or the column and the bestiary line go. Raised by 52-review-combat' },
  { id: 'S-X02', lane: 'synthesis', cls: 2, status: 'CONFIRMED', what: 'The store\'s five heals are a hand price table: 0.19, 0.33, 0.83, 1.50 and 1.75 gold a hit point from shrimp to shark, nine times apart, while coin a kill is a formula', where: 'src/data/supply-basics.js BASIC_SUPPLIES (heal rows)', fix: 'coefficient layer: price = hit points x one gold-a-hit-point line. Raised by 55-review-economy' },
  { id: 'S-X03', lane: 'synthesis', cls: 2, status: 'HYPOTHESIS', what: 'Mana a version is a hand-written x1.2 ladder typed on 16 spell rows. Confirm by reading the versions of each row in src/data/abilities.js', where: 'src/data/abilities.js versions', fix: 'coefficient layer: one step beside RUNE_TIERS stepPm. Raised by 52-review-combat, not read here' },
];

// ── CROSS-CATEGORY EDGES (left feeds right), on the ids that stay. From the three lanes' "edges that leave" tables. ─────────────
export const ALIASES = { 'P-SKILL-LEVEL': 'P03' };
export const CROSS_EDGES = [
  ['P03', 'C-HERO-TOHIT'], ['P03', 'C-MON-TOHIT'], ['P03', 'C-CAST-POWER'],
  ['P11', 'C-MON-STATS'], ['P11', 'C-SPELL-HEAL'], ['P11', 'C-REGEN'], ['P11', 'C-TARGET'], ['P11', 'C-MANA'],
  ['P35', 'C-GEAR-ARMOR'], ['C-GEAR-ARMOR', 'P11'],
  ['C-MON-TOHIT', 'P07'], ['C-TARGET', 'P07'], ['C-HURT', 'P06'], ['C-MANA', 'P08'], ['C-TRAINING', 'P09'],
  ['C-HURT', 'E14'], ['C-PULL', 'E14'], ['C-AREA', 'E14'], ['C-CLOCKS', 'E14'], ['C-REGEN', 'E14'],
  ['C-MON-BLOW', 'E18'], ['C-ARMOR-CHAIN', 'E18'], ['C-SPELL-HEAL', 'E18'], ['C-REGEN', 'E18'], ['C-LEECH', 'E18'], ['C-MANA', 'E18'],
  ['E30', 'C-CAST-POWER'], ['E30', 'C-BASIC-BLOW'], ['E38', 'P17'], ['P01', 'P22'], ['C-SCALED', 'P22'], ['E40', 'C-JEWEL-PERKS'], ['E55', 'C-RESIST-HERO'], ['E55', 'C-LEECH'],
  ['C-BOSS-ROOM', 'E48'], ['C-RUN-ROOM', 'E49'],
  ['C-GEAR-WEAPON', 'E27'], ['C-GEAR-WEAPON', 'E30'], ['C-GEAR-WEAPON', 'E38'], ['C-GEAR-WEAPON', 'E40'],
  ['P28', 'E37'], ['E01', 'P20'],
  /* the circle: the contract is re-pinned to what the grounds were measured to pay, and the grounds are fitted to the contract */
  ['E14', 'P02'],
];

// ── CLASS 3: ONE RECOMMENDATION EACH (keep = keep and document, fold = fold into a shared mechanic, remove). `approved` is a ruling
//    date, or null when no approval of Tyler's is on record. ───────────────────────────────────────────────────────────────────
const K = 'keep', FOLD = 'fold', RM = 'remove';
export const CLASS3 = {
  'X-NAMED-RAT-KING': [FOLD, '2026-11-18 ("open at 5")', 'The boss cap should bound his spell, not his attack. Then his row is the formula\'s and the named exception goes'],
  'X-DANGER-RAMP': [K, null, 'One early-game curve for every ground under Level 16. Gentle first grounds are right. Document it as the only Level threshold in monster stats'],
  'X-TIER-PULL-FLOOR': [RM, null, 'It contradicts the 2026-11-07 ruling that harder tiers keep the bigger pulls. Its cause is kill reward with no kill-rate term, which the kill reward formula fixes'],
  'X-CELLAR-NORMAL-ONLY': [K, '2026-11-05', 'A content flag on the tutorial ground. It changes no formula'],
  'X-SCALED-NO-DEADLY': [FOLD, null, 'A tier a ground does not offer is the same content flag the Mill Cellar uses. One mechanic, read from the mode\'s row'],
  'X-SPELL-FLOOR': [FOLD, '2026-11-21 (32-8, the effect)', 'Keep the effect you ruled. Replace 17 per-row floors with one number: a cast never reads a hit under N'],
  'X-MEND-MAXHP': [K, '2026-11-21 (32-4)', 'The second of two heal kinds, a share of max HP. It is the one heal that never falls behind at high Level'],
  'X-THREE-ROLLS': [FOLD, null, 'One roll rule with the spread as one number a kind of amount: swings, spell hits, heals. Three rows of one rule'],
  'X-PARTY-ONLY-ROWS': [K, '2026-11-09 and 2026-11-19', 'One shared gate read from data. Tank spells are party only by your ruling'],
  'X-BRACE': [FOLD, '2026-11-08 (direction)', 'Make it a stat on the shield row, so a future shield can carry more or less of it. No rule keyed on a slot'],
  'X-ELEMENT-RULES': [K, '2026-11-18 (the two elements)', 'Storm burning mana and Necrotic cutting heals are what make the two elements different. The numbers need your yes before the switch goes on'],
  'X-TEMPER-ROUNDING': [FOLD, null, 'Rounding by chance is the right idea. Use it once, at the end of the one amount pipeline, for every blow. Then small bonuses pay at low Level everywhere'],
  'X-BOSS-FLOOR-CAP': [K, null, 'A boss must not one-shot the hero his ground is written for. Keep it as a bound in the monster formula and it needs your yes'],
  'X-CALLED-ROOM': [K, '2026-11-04 and 2026-11-05', 'A called fight is practice and a keyed hall is the reward. Two rows of one room mechanic'],
  'X-DUMMY': [K, '2026-11-08', 'The training yard needs a target that cannot kill or die'],
  'X-CASTER-BASIC': [K, '2026-10-15 and 2026-10-23', 'A basic attack costs by weapon. It is the supply identity of each way of fighting'],
  'X-PARTY-FIT': [K, null, 'Keep "built for a party" as one encounter type with three numbers (HP, blow, XP). Remove its three inner patches. 53-review-world asks to remove the whole type: the matrix decides between them'],
  'P-X07': [FOLD, '2026-11-11', 'Fold the +15% into the base of the one party table as its first cell. The number stays. One constant less'],
  'P-X09': [FOLD, null, 'The Tower takes the one party table. Your 2026-11-16 words were one table and not a unique formula everywhere'],
  'P-X14': [K, '2026-11-14', 'The Tower trades XP for a free death. It is one row of the mode table'],
  'P-X15': [K, '2026-11-16 (the mode, not the numbers)', 'Keep the Catacombs on the mode table. Its copied numbers stay marked ASSUMED until the matrix plays them'],
  'P-X18': [K, '2026-11-09 and 2026-11-21', 'Level XP loses a share of the total and a skill a share of its progress. Take Inner Flame off the list: it is trained at the Hearth, not in a fight'],
  'P-X20': [FOLD, '2026-10-18', 'Free under Level 30 falls out of a price that follows the hours a Blessing saves. Early deaths cost minutes, so the price is near zero with no threshold'],
  'P-X28': [RM, '2026-11-14', 'One fixed rate makes the yard worthless near skill 100. Pay a share of the skill level\'s cost. This changes a ruling, so it is your call'],
  'P-X33': [FOLD, '2026-11-15 and 2026-11-16', 'A rung is worth less on stronger gear. Make the rung size one line by gear Level, so the next band needs no new hand number'],
  'P-X35': [K, '2026-11-04', 'Starter gear has no Tempering. A content flag'],
  'P-X37': [K, '2026-11-14', 'Boss gems fix one thing about a jewelry roll. A content rule on the craft, not a combat formula'],
  'P-X38': [RM, '2026-11-14 against 2026-11-18', 'A flat +4 skill is about 1.4 damage at any Level, and you asked for major upgrades. Make it a percent of the blow'],
  'P-X41': [K, null, 'Melee trains on damage dealt, Magic on mana spent, Defense on blows taken. Three bases for three different jobs. It needs your yes on record'],
  'P-X44': [K, '2026-11-20 (27-5)', 'Events add and never pass +50%. One line of the XP chain'],
  'E-X03': [FOLD, '2026-11-03 ("harder pays more on one line")', 'The coin line that climbs from x0.5 to x1.4 over the first grounds is one of four stacked coin dials. Fold all four into one coin line by monster Level'],
  'E-X11': [FOLD, '2026-11-07', 'Keep scaled hunts. Their XP and party shares become outputs of the kill reward formula, so nobody re-dials them an eighth time'],
  'E-X29': [K, '2026-11-14', 'A hero\'s first hall roll always lands. A good first-time moment'],
  'E-X30': [K, '2026-11-14 to 2026-11-16', 'Chest warmth and stokes are the pity rule. Bounded by construction'],
  'E-X32': [K, '2026-11-18 (linings, BUILD LATER)', 'The parts wait for linings. Nothing planned is cut. When linings land, part value becomes one line by monster Level with no steps'],
};

// ── WHAT EACH FRAMEWORK OF THE MODEL REMOVES: [framework, roadmap steps, the class 4 rows that go]. Every id must be a class 4 row, once. ──
export const REMOVES = [
  ['Dead rules deleted', 'R1', ['E-X26', 'E-X27', 'E-X28', 'X-STALE-HP-NOTE']],
  ['Power from named constants, and a row that stores its blow', 'R2, R4, R7', ['X-POWER-LITERALS', 'X-ART-TIER-SCALE', 'X-REFHP-OFF-BY-ONE']],
  ['Each duplicate becomes one', 'R3', ['X-ROLL-TWINS', 'X-TIER-LADDER-TWINS', 'X-MARK-TWO-WAYS', 'X-ROW-DOOR-BYPASS', 'X-STEADY-TWO-MEANINGS', 'P-X19', 'P-X21', 'E-X38']],
  ['One tier table, applied once', 'R7, R12', ['X-TIER-TRIPLE', 'X-TIER-PER-GROUND', 'X-SCALED-THICKET', 'X-PARTY-FIT-PATCHES']],
  ['One XP chain', 'R5, R8, R22', ['P-X06', 'X-TOWER-HEAT', 'X-TOWER-TOP']],
  ['One coin line and one sale formula', 'R9, R17', ['E-X02', 'E-X05', 'E-X17', 'E-X18', 'E-X19']],
  ['The gear curve and exchange rates', 'R10, R11', ['X-LINE-IN-TOOLS', 'X-ARMOR-LINE-FIT', 'P-X34', 'X-POWER-TOOLS']],
  ['The pace law and the derived kill reward', 'V1, R12, R13', ['E-X01', 'E-X04', 'X-GENTLE-HP', 'X-GENTLE-CAP', 'P-X02', 'P-X42', 'P-X43']],
  ['Spells read their own weakness', 'R6', ['X-SPELLS-SKIP-WEAKNESS']],
  ['Drops authored in hours', 'R18', ['E-X14']],
  ['One amount pipeline', 'R19', ['X-FLOOR-CHAIN', 'X-SHEET-ORDER']],
  ['One modifier table', 'R20', ['X-STACKING-RULES', 'X-SET-CRIT', 'X-DORMANT-FACTORS', 'S-X01']],
  ['Every monster reads the formula', 'R21', ['X-HAND-ROWS', 'X-NAMED-HASK-LOOKOUT', 'X-LEVEL-BY-TIER', 'X-SPELL-HOLDS']],
  ['One skill grant', 'later, with the wipe', ['P-X24', 'P-X25', 'P-X26', 'P-X27']],
  ['The simulator stops editing and approximating', 'R23', ['X-MUTABLE-ROWS', 'E-X37']],
];

// ── the build ───────────────────────────────────────────────────────────────
export function build(lanes, o = {}) {
  const fMerges = o.formulaMerges || FORMULA_MERGES, xMerges = o.exceptionMerges || EXCEPTION_MERGES, class3 = o.class3 || CLASS3, added = o.added || ADDED;
  const problems = [];
  const fById = new Map(lanes.formulas.map((f) => [f.id, f])), xById = new Map(lanes.exceptions.map((x) => [x.id, x]));
  // formulas
  const alias = new Map(Object.entries(ALIASES));
  const gone = new Set();
  const formulas = [];
  const also = new Map();
  for (const [keep, others, owner] of fMerges) {
    if (!fById.has(keep)) problems.push('formula merge keeps ' + keep + ', which no register holds');
    for (const a of others) {
      if (!fById.has(a)) problems.push('formula merge of ' + keep + ' names ' + a + ', which no register holds');
      if (gone.has(a)) problems.push('formula ' + a + ' is merged twice');
      gone.add(a); alias.set(a, keep);
    }
    also.set(keep, { others, owner });
  }
  for (const f of lanes.formulas) {
    if (gone.has(f.id)) continue;
    const m = also.get(f.id);
    const cats = [...new Set([f.lane, ...(m ? m.others.map((a) => (fById.get(a) || {}).lane).filter(Boolean) : [])])];
    formulas.push({ id: f.id, also: m ? m.others : [], categories: cats, owner: m ? m.owner : null, what: f.what, where: f.where, state: f.state });
  }
  // exceptions
  const xGone = new Set(), xAlso = new Map();
  for (const m of xMerges) {
    if (!xById.has(m.id)) problems.push('exception merge keeps ' + m.id + ', which no register holds');
    const classes = new Set([(xById.get(m.id) || {}).cls]);
    for (const a of m.also) {
      if (!xById.has(a)) { problems.push('exception merge of ' + m.id + ' names ' + a + ', which no register holds'); continue; }
      if (xGone.has(a)) problems.push('exception ' + a + ' is merged twice');
      xGone.add(a); classes.add(xById.get(a).cls);
    }
    if (classes.size > 1 && !(m.cls && m.decided)) problems.push('exception merge ' + m.id + ': the lanes filed classes ' + [...classes].join(' and ') + ', the merge must name `cls` and `decided`');
    if (classes.size === 1 && m.cls && m.cls !== [...classes][0]) problems.push('exception merge ' + m.id + ' moves a class the lanes agreed on');
    xAlso.set(m.id, m);
  }
  const exceptions = [];
  for (const x of [...lanes.exceptions, ...added]) {
    if (xGone.has(x.id)) continue;
    const m = xAlso.get(x.id);
    const members = m ? m.also.map((a) => xById.get(a)).filter(Boolean) : [];
    /* a merged row is CONFIRMED when any lane confirmed it, unless the merge says otherwise */
    const status = m && m.status ? m.status : [x, ...members].some((r) => r.status === 'CONFIRMED') ? 'CONFIRMED' : 'HYPOTHESIS';
    const fix = x.fix || (members.find((r) => r.fix) || {}).fix || '';
    exceptions.push({ id: x.id, also: m ? m.also : [], categories: [...new Set([x.lane, ...members.map((r) => r.lane)])], class: m && m.cls ? m.cls : x.cls, status, what: x.what, where: x.where, fix, decided: m && m.decided ? m.decided : null });
  }
  // class 3: exactly one recommendation each, and none for a row that is not class 3
  const three = exceptions.filter((x) => x.class === 3);
  for (const x of three) {
    const r = class3[x.id];
    if (!r) problems.push('class 3 row ' + x.id + ' has no recommendation');
    else if (![K, FOLD, RM].includes(r[0]) || !r[2]) problems.push('class 3 row ' + x.id + ': the recommendation must be keep, fold or remove, with a reason');
  }
  for (const id of Object.keys(class3)) if (!three.find((x) => x.id === id)) problems.push('a recommendation names ' + id + ', which is not a class 3 row');
  // what the model removes: every id a class 4 row, named once
  const four = exceptions.filter((x) => x.class === 4), removed = new Set();
  for (const [name, , idsOf] of (o.removes || REMOVES)) for (const id of idsOf) {
    if (!four.find((x) => x.id === id)) problems.push('"' + name + '" removes ' + id + ', which is not a class 4 row');
    if (removed.has(id)) problems.push(id + ' is removed by two frameworks');
    removed.add(id);
  }
  const notRemoved = four.filter((x) => !removed.has(x.id)).map((x) => x.id);
  // edges on the ids that stay
  const canon = (id) => { let v = id, n = 0; while (alias.has(v) && n++ < 5) v = alias.get(v); return v; };
  const ids = new Set(formulas.map((f) => f.id));
  const seen = new Set(), edges = [];
  const catOf = new Map(formulas.map((f) => [f.id, f.id.startsWith('C-') ? 'combat' : f.id.startsWith('P') ? 'progression' : 'economy']));
  for (const [a0, b0] of [...lanes.edges, ...CROSS_EDGES]) {
    const a = canon(a0), b = canon(b0);
    if (!ids.has(a) || !ids.has(b)) { problems.push('edge ' + a0 + ' -> ' + b0 + ' names a formula that is not in the inventory'); continue; }
    if (a === b || seen.has(a + '>' + b)) continue;
    seen.add(a + '>' + b); edges.push([a, b]);
  }
  const out = new Map([...ids].map((i) => [i, []]));
  for (const [a, b] of edges) out.get(a).push(b);
  const reach = (start) => { const r = new Set(), q = [start]; while (q.length) for (const n of out.get(q.pop())) if (n !== start && !r.has(n)) { r.add(n); q.push(n); } return r; };
  const reachOf = new Map([...ids].map((i) => [i, reach(i)]));
  const hubs = [...ids].map((i) => ({ id: i, category: catOf.get(i), feeds: out.get(i).length, reaches: reachOf.get(i).size, categoriesReached: [...new Set([...reachOf.get(i)].map((n) => catOf.get(n)))].length }))
    /* ranked by direct readers: nearly every formula can reach the play loops (a skill trains by fighting, a Level raises HP), so total reach
       alone ranks nothing */
    .sort((a, b) => b.feeds - a.feeds || b.reaches - a.reaches || a.id.localeCompare(b.id));
  /* the circles: every formula that can reach itself, grouped */
  const inCycle = [...ids].filter((i) => out.get(i).some((n) => n === i || reachOf.get(n).has(i))).sort();
  const cross = edges.filter(([a, b]) => catOf.get(a) !== catOf.get(b));
  const byClass = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const x of exceptions) byClass[x.class]++;
  const counts = {
    raw: { formulas: lanes.formulas.length, exceptions: lanes.exceptions.length, byLane: lanes.raw },
    formulas: formulas.length, formulasMerged: gone.size,
    exceptions: exceptions.length, exceptionsMerged: xGone.size, exceptionsAdded: added.length,
    byClass, confirmed: exceptions.filter((x) => x.status === 'CONFIRMED').length, hypothesis: exceptions.filter((x) => x.status === 'HYPOTHESIS').length,
    class3Approved: three.filter((x) => class3[x.id] && class3[x.id][1]).length, class3NoApproval: three.filter((x) => class3[x.id] && !class3[x.id][1]).length,
    classDecided: exceptions.filter((x) => x.decided).length,
    class4Removed: removed.size, class4Left: notRemoved,
    edges: edges.length, crossEdges: cross.length, inCycle: inCycle.length,
  };
  return { problems, formulas, exceptions, edges, cross, hubs, inCycle, counts, catOf, class3, removes: o.removes || REMOVES };
}

// ── THE KNOB FILE (knobs.json, the audited set of 44 section 5.5, in the format of lane/c-balance-matrix's tools/balance-program/knobs.mjs).
//    Checked here so it cannot go stale in silence: every site picks exactly the lines and numbers it names on the tree (the matrix's
//    locateKnob rule), `value` is what the tree holds today, every id is once, a `formula` is in the inventory, a `sharesLineWith` is
//    mutual and true, and a planned knob names a roadmap step. ──
const NUM = '(-?\\d+(?:\\.\\d+)?)';
export function knobValues(root, knob) {
  const out = [], lines = [];
  for (const site of knob.sites) {
    const text = lf(readFileSync(join(root, site.file), 'utf8')).split('\n');
    const hits = text.map((t, i) => [t, i]).filter(([t]) => t.includes(site.line));
    if (hits.length !== site.count) throw new Error(site.file + ' has ' + hits.length + ' lines with ' + JSON.stringify(site.line) + ', the knob names ' + site.count);
    for (const [t, i] of hits) {
      lines.push(site.file + ':' + (i + 1));
      for (const n of site.nums) {
        if (n && n.all) { for (const m of t.matchAll(/(?<![\w.])(-?\d+(?:\.\d+)?)(?![\w.])/g)) out.push(Number(m[1])); continue; }
        const src = typeof n === 'string' ? n : n.at;
        const ms = [...t.matchAll(new RegExp('(' + src + ')' + NUM, 'g'))];
        if (ms.length !== 1) throw new Error(site.file + ':' + (i + 1) + ' has ' + ms.length + ' numbers after /' + src + '/, the knob names 1');
        out.push(Number(ms[0][2]));
      }
    }
  }
  return { values: out, lines };
}
export function knobProblems(file, formulaIds, root = ROOT) {
  const out = [];
  if (!file) return ['knobs.json is missing'];
  if (file.schema !== KNOB_SCHEMA) out.push('knobs.json: schema ' + file.schema + ' is not ' + KNOB_SCHEMA);
  const seen = new Set(), linesOf = new Map();
  for (const k of file.knobs || []) {
    if (seen.has(k.id)) out.push('knob ' + k.id + ' is listed twice');
    seen.add(k.id);
    for (const key of ['label', 'group', 'what']) if (!k[key]) out.push('knob ' + k.id + ' has no ' + key);
    if (!Array.isArray(k.steps) || !k.steps.includes(1)) out.push('knob ' + k.id + ': steps must include 1 (today)');
    if (!formulaIds.has(k.formula)) out.push('knob ' + k.id + ' names formula ' + k.formula + ', which is not in the inventory');
    try {
      const { values, lines } = knobValues(root, k);
      linesOf.set(k.id, new Set(lines));
      if (JSON.stringify(values) !== JSON.stringify(k.value)) out.push('knob ' + k.id + ': the tree holds ' + JSON.stringify(values) + ', knobs.json says ' + JSON.stringify(k.value));
    } catch (e) { out.push('knob ' + k.id + ': ' + e.message); }
  }
  for (const k of file.knobs || []) {
    const mine = linesOf.get(k.id) || new Set();
    const sharing = [...linesOf].filter(([id, set]) => id !== k.id && [...set].some((l) => mine.has(l))).map(([id]) => id).sort();
    if (JSON.stringify(sharing) !== JSON.stringify([...(k.sharesLineWith || [])].sort())) out.push('knob ' + k.id + ' shares a source line with [' + sharing.join(', ') + '], knobs.json says [' + (k.sharesLineWith || []).join(', ') + ']');
  }
  for (const p of file.planned || []) {
    if (seen.has(p.id)) out.push('planned knob ' + p.id + ' is also a live knob, or is listed twice');
    seen.add(p.id);
    if (!/^[VR]\d+$/.test(p.arrivesWith || '')) out.push('planned knob ' + p.id + ' names no roadmap step');
    if (!formulaIds.has(p.formula)) out.push('planned knob ' + p.id + ' names formula ' + p.formula + ', which is not in the inventory');
  }
  return out;
}
const readKnobs = () => { const t = read(KNOBS_FILE); return t == null ? null : JSON.parse(t); };

// ── what it writes ──────────────────────────────────────────────────────────
export function tables(b) {
  const c = b.counts;
  const COUNTS = ['| | The three lanes | After dedupe |', '|---|---|---|',
    '| Formulas | ' + c.raw.formulas + ' (combat ' + c.raw.byLane.combat[0] + ', progression ' + c.raw.byLane.progression[0] + ', economy ' + c.raw.byLane.economy[0] + ') | **' + c.formulas + '** (' + c.formulasMerged + ' were the same formula filed twice) |',
    '| Exceptions | ' + c.raw.exceptions + ' (combat ' + c.raw.byLane.combat[1] + ', progression ' + c.raw.byLane.progression[1] + ', economy ' + c.raw.byLane.economy[1] + ') | **' + c.exceptions + '** (' + c.exceptionsMerged + ' merged away, ' + c.exceptionsAdded + ' added from the design reviews) |',
    '| Class 1, foundational | | ' + c.byClass[1] + ' |', '| Class 2, content number | | ' + c.byClass[2] + ' |',
    '| Class 3, intentional special rule | | ' + c.byClass[3] + ' (' + c.class3Approved + ' with a ruling on record, ' + c.class3NoApproval + ' with none) |',
    '| Class 4, accidental | | ' + c.byClass[4] + ' |',
    '| Confirmed, hypothesis | | ' + c.confirmed + ', ' + c.hypothesis + ' |',
    '| Rows where two lanes disagreed on the class | | ' + c.classDecided + ' |',
    '| Edges between formulas | | ' + c.edges + ' (' + c.crossEdges + ' cross a category) |',
    '| Formulas that sit on a circle | | ' + c.inCycle + ' |'].join('\n');
  const FORMULAS = ['| id | also filed as | categories | what it computes | where | state |', '|---|---|---|---|---|---|',
    ...b.formulas.map((f) => '| ' + [f.id, f.also.join(', '), f.categories.map((k) => CATEGORY[k]).join(', '), clip(f.what, 240) + (f.owner ? ' **Owner:** ' + f.owner : ''), f.where, f.state].map(cell).join(' | ') + ' |')].join('\n');
  const EXCEPTIONS = ['| id | also filed as | class | status | what it does | where | the fix |', '|---|---|---|---|---|---|---|',
    ...[...b.exceptions].sort((x, y) => y.class - x.class).map((x) => '| ' + [x.id, x.also.join(', '), x.class, x.status, clip(x.what, 260) + (x.decided ? ' **Class decided here:** ' + x.decided : ''), clip(x.where, 110), clip(x.fix, 200)].map(cell).join(' | ') + ' |')].join('\n');
  const EDGES = ['Edges that cross a category (' + b.cross.length + ', read "left feeds right"):', '',
    ...b.cross.map(([x, y]) => '- ' + x + ' (' + b.catOf.get(x) + ') -> ' + y + ' (' + b.catOf.get(y) + ')'), '',
    'Formulas that sit on a circle, where a change comes back round to its own input (' + b.inCycle.length + '): ' + b.inCycle.join(', ')].join('\n');
  const whatOf = new Map(b.formulas.map((f) => [f.id, f.what]));
  const HUBS = ['| formula | what it is | category | read directly by | reaches in all | of ' + b.formulas.length + ' |', '|---|---|---|---|---|---|',
    ...b.hubs.slice(0, 12).map((h) => '| ' + h.id + ' | ' + cell(clip(whatOf.get(h.id), 90)) + ' | ' + h.category + ' | ' + h.feeds + ' | ' + h.reaches + ' | ' + Math.round(100 * h.reaches / (b.formulas.length - 1)) + '% |')].join('\n');
  const word = { keep: 'Keep and document', fold: 'Fold into a shared mechanic', remove: 'Remove' };
  const CLASS3_TABLE = ['| id | what it is | approved | recommendation | why |', '|---|---|---|---|---|',
    ...b.exceptions.filter((x) => x.class === 3).map((x) => { const r = b.class3[x.id] || ['', null, '']; return '| ' + [x.id + (x.also.length ? ' (' + x.also.join(', ') + ')' : ''), clip(x.what, 170), r[1] || '**none on record**', '**' + (word[r[0]] || '') + '**', r[2]].map(cell).join(' | ') + ' |'; })].join('\n');
  const REMOVES_TABLE = ['| Framework | Roadmap steps | Accidental exceptions it removes |', '|---|---|---|',
    ...b.removes.map(([name, steps, idsOf]) => '| ' + name + ' | ' + steps + ' | ' + idsOf.map((i) => '`' + i + '`').join(', ') + ' |'),
    '| **In all** | | **' + c.class4Removed + ' of ' + c.byClass[4] + '** |',
    '| No framework behind it | | ' + (c.class4Left.map((i) => '`' + i + '`').join(', ') || 'none') + ' |'].join('\n');
  return { COUNTS, FORMULAS, EXCEPTIONS, EDGES, HUBS, CLASS3: CLASS3_TABLE, REMOVES: REMOVES_TABLE };
}

export function register(b) {
  return { schema: SCHEMA, doc: 'docs/design/balance-program/44-formula-architecture.md', brief: 'docs/design/balance-program/40-formula-brief.md',
    sources: ['formulas-combat.json', 'formulas-progression.json', 'formulas-economy.json'].map((f) => 'tools/balance-program/formulas/' + f),
    classes: { 1: 'foundational mechanic', 2: 'content parameter, belongs in data', 3: 'intentional special mechanic, needs Tyler\'s explicit approval', 4: 'accidental complexity, eliminate' },
    counts: b.counts, formulas: b.formulas, exceptions: b.exceptions,
    class3: b.exceptions.filter((x) => x.class === 3).map((x) => ({ id: x.id, recommendation: (b.class3[x.id] || [])[0], approved: (b.class3[x.id] || [])[1] || null, why: (b.class3[x.id] || [])[2] })),
    edges: b.edges.map(([from, to]) => ({ from, to })), hubs: b.hubs.slice(0, 12), inCycle: b.inCycle };
}

const mark = (k) => ['<!-- GENERATED:' + k + ' (' + SELF + ' --write) -->', '<!-- END GENERATED:' + k + ' -->'];
export function docWith(text, t) {
  let out = text;
  for (const k of Object.keys(t)) {
    const [a, z] = mark(k);
    const i = out.indexOf(a), j = out.indexOf(z);
    if (i < 0 || j < i) throw new Error('architecture-register: the doc has no ' + k + ' markers');
    out = out.slice(0, i + a.length) + '\n' + t[k] + '\n' + out.slice(j);
  }
  return out;
}
/** What --check calls stale, from the two files' texts (null = missing). Pure, so --selftest can plant on it. */
export function staleOf(jsonText, docText, json, t) {
  const stale = [];
  if (jsonText == null || lf(jsonText) !== json) stale.push('formulas-architecture.json');
  if (docText == null || lf(docText) !== docWith(lf(docText), t)) stale.push('44-formula-architecture.md tables');
  return stale;
}

function main() {
  const b = build(loadLanes());
  if (b.problems.length) { console.error('architecture-register: ' + b.problems.join('\n  ')); process.exit(2); }
  const mode = process.argv[2];
  const fIds = new Set(b.formulas.map((x) => x.id));
  const knobs = readKnobs();
  /* A KNOB'S VALUE IS THE TREE'S. A lane that moves a coefficient moves a knob's `value`: --write reads it again, --check says STALE until
     it has. A drifted value never fails --selftest (that step proves the checker bites; it must not turn red for a balance change). */
  if (mode === '--write' && knobs) {
    for (const k of knobs.knobs) { try { k.value = knobValues(ROOT, k).values; } catch { /* reported below */ } }
    const text = JSON.stringify(knobs, null, 1) + '\n';
    if (text !== read(KNOBS_FILE)) writeFileSync(KNOBS_FILE, text);
  }
  const knobBad = knobProblems(knobs, fIds);
  b.counts.knobs = knobs ? knobs.knobs.length : 0; b.counts.knobsPlanned = knobs ? knobs.planned.length : 0;
  const t = tables(b), json = JSON.stringify(register(b), null, 1) + '\n';
  if (mode !== '--check' && mode !== '--selftest' && knobBad.length) console.error('architecture-register: knobs.json\n  ' + knobBad.join('\n  '));
  if (mode === '--write') {
    writeFileSync(JSON_FILE, json);
    const doc = read(DOC_FILE);
    if (doc != null) writeFileSync(DOC_FILE, docWith(doc, t));
    console.log('wrote ' + JSON_FILE + (doc != null ? ' and the tables of ' + DOC_FILE : ' (no doc yet)'));
  } else if (mode === '--check') {
    const stale = staleOf(read(JSON_FILE), read(DOC_FILE), json, t);
    if (knobBad.length) stale.push('knobs.json (' + knobBad.join(' | ') + ')');
    if (stale.length) { console.error('architecture-register: STALE ' + stale.join(', ') + ' (run --write)'); process.exit(1); }
    console.log('architecture-register: in step');
  } else if (mode === '--selftest') {
    /* in-memory only: no file is written. The doc is built from this file's own tables. */
    const crlf = (s) => lf(s).replace(/\n/g, '\r\n');
    const doc = docWith(Object.keys(t).map((k) => mark(k).join('\n')).join('\nprose\n') + '\n', t);
    const row = '| ' + b.formulas[0].id + ' |';
    const lanes = loadLanes();
    const threeId = b.exceptions.find((x) => x.class === 3).id;
    /* knob plants are counted against today's problems, on the first knob that has none, so a value a lane moved cannot fail this step */
    const base = knobBad.length, ki = knobs.knobs.findIndex((k) => !knobBad.some((p) => p.startsWith('knob ' + k.id + ' ') || p.startsWith('knob ' + k.id + ':')));
    const kp = (file) => knobProblems(file, fIds).length - base;
    const on = (fn) => ({ ...knobs, knobs: knobs.knobs.map((k, i) => (i === ki ? fn(k) : k)) });
    const without = Object.fromEntries(Object.entries(CLASS3).filter(([k]) => k !== threeId));
    const cases = [
      ['LF, in step', staleOf(json, doc, json, t).length, 0],
      ['CRLF checkout of both files, in step', staleOf(crlf(json), crlf(doc), json, t).length, 0],
      ['CRLF doc with one table row changed', staleOf(crlf(json), crlf(doc.replace(row, row + ' planted |')), json, t).length, 1],
      ['CRLF register with one value changed', staleOf(crlf(json.replace(SCHEMA, 'planted')), crlf(doc), json, t).length, 1],
      ['a merge that names a row no register holds', build(lanes, { formulaMerges: [...FORMULA_MERGES, ['C-HERO-POWER', ['P999'], 'planted']] }).problems.length, 1],
      ['a merge across two classes with no decision', build(lanes, { exceptionMerges: EXCEPTION_MERGES.map((m) => (m.decided ? { id: m.id, also: m.also } : m)) }).problems.filter((p) => p.includes('must name `cls`')).length, b.counts.classDecided],
      ['a class 3 row with no recommendation', build(lanes, { class3: without }).problems.length, 1],
      ['a framework that removes a row that is not class 4', build(lanes, { removes: [...REMOVES, ['planted', 'R0', ['X-MIN-ONE']]] }).problems.length, 1],
['a knob whose number moved on the tree', kp(on((k) => ({ ...k, value: k.value.map((v) => v + 1) }))), 1],
      ['a knob whose line is not in the file', knobProblems(on((k) => ({ ...k, sites: [{ ...k.sites[0], line: 'no such line planted' }] })), fIds).filter((p) => p.includes('has 0 lines')).length, 1],
      ['a knob that names a formula not in the inventory', kp(on((k) => ({ ...k, formula: 'C-PLANTED' }))), 1],
      ['two knobs on one line with the mark taken off', knobProblems({ ...knobs, knobs: knobs.knobs.map((k) => ({ ...k, sharesLineWith: undefined })) }, fIds).filter((p) => p.includes('shares a source line')).length, knobs.knobs.filter((k) => k.sharesLineWith).length],
      ['a planned knob with no roadmap step', kp({ ...knobs, planned: knobs.planned.map((p, i) => (i ? p : { ...p, arrivesWith: 'soon' })) }), 1],
      ['a recommendation for a row that is not class 3', build(lanes, { class3: { ...CLASS3, 'X-POWER-LITERALS': [K, null, 'planted'] } }).problems.length, 1],
    ];
    let red = 0;
    for (const [name, got, want] of cases) { const ok = got === want; if (!ok) red++; console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + got + (ok ? '' : ' (wanted ' + want + ')')); }
    if (!doc.includes(row) || !json.includes(SCHEMA) || !b.counts.classDecided || ki < 0) { console.log('FAIL a plant found nothing to change'); red++; }
    if (red) { console.error('architecture-register --selftest: ' + red + ' case(s) FAILED'); process.exit(1); }
    console.log('architecture-register --selftest: ' + cases.length + ' cases');
  }
  console.log(JSON.stringify(b.counts));
}
if (isMain(import.meta.url)) main();
