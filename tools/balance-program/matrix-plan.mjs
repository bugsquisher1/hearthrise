// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/matrix-plan.mjs — THE CELLS THE BALANCE MATRIX PLAYS (40-formula-brief section 5, lane/c-balance-matrix).
//
// ONE CELL BUILDER. Every cell is tools/balance-program/progression-grid.mjs buildCell (the grid's kits, skill lines, tier pulls and
// projected rows), so the matrix, the grid and the solver's ground rates are the same cells played the same way. The matrix adds the axes
// the grid lacks:
//   WAYS        every weapon way the engine plays (tools/balance-sim/styles.mjs: tank, sword, hammer, axes, bow, crossbow, mage, healer),
//               each alone; the fist line is a hidden two-row sample (src/data/fists.js FIST_LINE.live false) with no way yet: not played
//   GROUNDS     every hunt ground at both ends of its band, every party of 50-standards 1.3 and every tier it has, MID (the ground axis the
//               solver reads: tools/balance-program/atlas/rates.mjs huntGrounds / bandEnds / partyComps, the same definition)
//   HIGH        Levels 1,000, 2,000 and 5,000 on the projector's placeholder grounds and projected gear line (grid-project.mjs), PROJECTED
//   STEPS       each gear step per slot class: the upper state with ONE class (weapon, armor, jewelry) from the state below (grid-kit mixPlan)
//   ARCHETYPES  not cells: every cell's fights broken down by the monster's archetype (archetypeOf, the rule below)
//
// THE ARCHETYPE RULE (written down, read from data only):
//   role   the monster's role in src/data/balance-sheet.js GROUND_ROSTER (swarm, regular, glass, heavy, elite, boss): the stat formula's own
//          word for its shape. A monster on no roster is 'boss' when its row says boss, else 'unrostered' (a hand row: named, not guessed).
//   shape  'caster' when its row names monster spells (monsters.js `spells`), 'ranged' when its row's range is over 1, else 'melee'.
//   class  its row's `cls` (src/data/monster-classes.js: mammal ... extradimensional): the weakness family.
// ════════════════════════════════════════════════════════════════════════
import * as STD from './standards.mjs';
import { STYLES } from '../balance-sim/styles.mjs';
import { compsOf, cellKey, buildCell, MAIN, readTracks } from './progression-grid.mjs';
import { huntGrounds, bandEnds, partyComps } from './atlas/rates.mjs';
import { lineKit } from './grid-project.mjs';
import { RUNE_TIERS as PLAYED_RUNE_TIERS } from '../balance-sim/played.mjs';

export const WAYS = Object.freeze(Object.keys(STYLES));
export const HIGH_LEVELS = Object.freeze([1000, 2000, 5000]);
/* the slot classes a gear step moves one at a time (grid-kit.mjs slot names) */
export const UPGRADE_CLASSES = Object.freeze({
  weapon: Object.freeze(['weapon']),
  armor: Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']),
  jewelry: Object.freeze(['ring1', 'ring2', 'earrings', 'necklace', 'cape']),
});
/* a step cell's id: the grid's own two (E1: MID with the LOW weapon / armor) keep their names, so its judge reads them */
export const stepId = (to, cls) => (to === 'mid' && cls !== 'jewelry' ? 'step:' + cls : to + '-step:' + cls);
export const STEP_PAIRS = Object.freeze([['low', 'mid'], ['mid', 'bis']]);
const lone = (way) => [[way], way === 'hammer' ? 'h' : way];

/* THE LINEUPS (docs/design/balance-program/52-review-combat.md sections 10.4 and 10.6, the Coordinator 2026-11-21): other fours on Deadly at
   Levels 60 and 110, MID, two seeds, on the four's own ground, beside the mixed four played the same way. They are the cells L16 has to move
   (every one held Deadly with no deaths; four mages killed as fast as the mixed four). Never in the band frame (the judge reads the mixed four);
   matrix-metrics.mjs deriveMatrix reads each against the mixed four. */
export const LINEUPS = Object.freeze([
  ['hammer', 'bow', 'mage', 'healer'],        // the standard four, as the real Krell four sat (the reference, at the lineups' own seeds)
  ['tank', 'healer', 'bow', 'mage'],          // the shield tank in front (the standard four until 2026-11-21)
  ['hammer', 'mage', 'mage', 'mage'],         // a hammer and three mages, no healer
  ['tank', 'healer', 'mage', 'mage'],         // a second mage in the bow seat
  ['tank', 'healer', 'hammer', 'mage'],       // a second melee in the bow seat
  ['tank', 'healer', 'crossbow', 'mage'],     // the crossbow in the bow seat
  ['mage', 'mage', 'mage', 'healer'],         // nobody in front
  ['mage', 'mage', 'mage', 'mage'],           // four mages
].map((s) => Object.freeze(s)));
export const lineupComp = (styles) => 'lu-' + styles.join('-');
const LINEUP_BLOCK = Object.freeze({ id: 'lineups', levels: Object.freeze([60, 110]), comps: LINEUPS.map((s) => [s, lineupComp(s)]), gears: ['mid'], tiers: ['deadly'], seeds: 2 });

/* THE MECHANICS A CELL NEVER HELD (F-framework-audit sections 3 and 8, the critical review's step 1, 2026-11-21). Each is a VARIANT of a plain cell:
   its tag rides in the key (cellKey's last part), it stays out of the band frame, and matrix-metrics.mjs deriveMatrix reads it against the plain
   cell of the same Level, gear, party and tier (played in the same run: `ways`, `four`, `parties`).
   buff    one timed buff, +10% damage kept up all hunt (cell.mjs buffRows), on three grounds (Levels 30, 60, 110), lone and the four, Normal and
           the hardest tier: whether a damage buff's gain is a product of its size or a step (the audit's group D)
   binds   a stamina bar that runs out half way, and a hero who starts broke under the game's gold floor (300): what each costs a hunt
   tracks  every build track of tools/balance-program/build-tracks.json (the hook for 10-level-choices.md, a pick every five Levels): none
           yet, so no cell; a track that lands plays here as data */
export const BUFF_BLOCK = Object.freeze({ id: 'buff', levels: Object.freeze([30, 60, 110]), comps: [lone('hammer'), ...compsOf(4)], gears: ['mid'], tiers: ['normal', 'hardest'],
  variants: Object.freeze([Object.freeze({ tag: 'buff:damage10', buffs: Object.freeze([Object.freeze({ type: 'damage', magnitude: 10 })]) })]) });
export const BINDS_BLOCK = Object.freeze({ id: 'binds', levels: Object.freeze([60, 110]), comps: [lone('hammer'), lone('mage')], gears: ['mid'], tiers: ['normal'],
  variants: Object.freeze([Object.freeze({ tag: 'stamina:half', staminaShare: 0.5 }), Object.freeze({ tag: 'purse:0', purse: 0, goldFloor: 300 })]) });
/* THE LEAVE RULE (the sitting S-6, RULED 2026-11-21: Deadly's death band and its lost hours stand; run both party defaults): the standard four on
   the harder tiers with every hero coming home on a death, beside the default where the rest hunt on (the four block) */
export const LEAVE_BLOCK = Object.freeze({ id: 'leave', comps: compsOf(4), gears: ['mid'], tiers: ['dangerous', 'hardest'],
  variants: Object.freeze([Object.freeze({ tag: 'leave:together', endTogether: true })]) });
export const TRACKS_BLOCK = Object.freeze({ id: 'tracks', tracks: true, comps: [lone('hammer'), ...compsOf(4)], gears: ['mid'], tiers: ['normal'] });
/* THE TALENT BUILDS (10-level-choices.md section 8.3; tools/balance-program/talents.mjs BUILDS): every lone way alone on Normal and the standard four on
   the hardest tier, MID, at Levels 25, 60, 110, 185 and 400, on the suggested build (S, the reference, its own cell here) and each contrast:
   A all Force (the damage ways and the four), C empty, D all safety (the four), B the built holder (the hammer on the tank's weights, in the two
   fours that put a hammer in front). Every cell is a variant (`build:<id>`); deriveMatrix and the TL bands read each against S. */
const DAMAGE_WAYS = Object.freeze(['sword', 'hammer', 'axes', 'bow', 'crossbow', 'mage']);
export const TALENT_BLOCK = Object.freeze({ id: 'talents', talents: true, levels: Object.freeze([25, 60, 110, 185, 400]), seats: Object.freeze([
  ...WAYS.map((w) => Object.freeze({ styles: [w], comp: w === 'hammer' ? 'h' : w, tier: 'normal', builds: DAMAGE_WAYS.includes(w) ? ['S', 'A', 'C'] : ['S', 'C'] })),
  Object.freeze({ styles: compsOf(4)[0][0], comp: compsOf(4)[0][1], tier: 'hardest', builds: ['S', 'A', 'B', 'C', 'D'] }),
  Object.freeze({ styles: ['hammer', 'mage', 'mage', 'mage'], comp: lineupComp(['hammer', 'mage', 'mage', 'mage']), tier: 'hardest', builds: ['S', 'B'] }),
]) });

/* CHECK C3, A STANDING CELL (patches/fb5-c3-default-company.json, FB-5; 08-player-experience.md sections 2.1 and 6): the default company a new account
   makes in the first hour, the Club first (the "Good first hero") and the pre-filled three (src/data/how-to-play.js COMPANY_PICKS: tank, healer,
   ranger), on the Millrace Sewer at its floor, Level 5, Normal, in the start kit (the arrival kit under Level 15), 4 seeds x 8 hours. C3 passes with
   no death. Printed beside it, never gated: the same four with no healer (the Staff swapped for a Club) and the four with the wand first (the
   played first hour picked the wand). If it fails, the four's first hunt together is Meadowbrook Thicket (chapter 08) */
export const C3_BLOCK = Object.freeze({ id: 'c3', levels: Object.freeze([5]), comps: Object.freeze([[['hammer', 'tank', 'healer', 'bow'], 'c3-club'], [['hammer', 'tank', 'hammer', 'bow'], 'c3-no-healer'], [['mage', 'tank', 'healer', 'bow'], 'c3-wand']]),
  gears: ['low'], tiers: ['normal'] });

/* THE DEATH SAMPLE (12-balance-pass.md section 1, R2 and R4; replayed by FB-3 on the fixed engine, audit A-0): what the harder tiers do to a
   four, read where a death count can be read, 4 seeds of 8 hours (X26: 32 hours a seat). The mid four's every gear state on Dangerous and the
   hardest tier; the lineups on Deadly; the buffed fours; the four's Talents builds; both party defaults (the leave block); and the 14 grounds
   at both band ends, the first four on Dangerous and the hardest tier. `--run deaths`, GitHub only */
const DEATHS = Object.freeze({ id: 'deaths', levels: Object.freeze([10, 30, 60, 110, 185, 400]), seeds: 4, hours: 8, blocks: Object.freeze([
  { id: 'four', comps: compsOf(4), gears: STD.GEAR_STATE_IDS, tiers: ['dangerous', 'hardest'] },
  { ...LINEUP_BLOCK, seeds: undefined },
  { id: 'buff', levels: [60, 185], comps: compsOf(4), gears: ['mid'], tiers: ['dangerous', 'hardest'], variants: [{ tag: 'buff:damage10', buffs: [{ type: 'damage', magnitude: 10 }] }, { tag: 'buff:defense10', buffs: [{ type: 'defense', magnitude: 10 }] }, { tag: 'buff:caps', buffs: [{ type: 'damage', magnitude: 15 }, { type: 'defense', magnitude: 10 }, { type: 'level_xp', magnitude: 30 }] }] },
  { ...TALENT_BLOCK, minSize: 4, levels: [60, 110, 185] },
  LEAVE_BLOCK,
  { id: 'grounds', grounds: true, sizes: [4], firstComp: true, tiers: ['dangerous', 'hardest'] },
  C3_BLOCK,
]) });

/* CHAPTER 14'S FULL-GAME BLOCK (14-the-rest.md section 1, FB-3 in CB-2's single pass): what the tool can already play of chapter 14, as one more
   block of the death sample, so the tier table is sized once with it in. The same cells on a copy with patches/ch14-full-game.json on (Necrotic and
   Storm live, the fist line live, CORE-3's +30% cap on "takes more"; GR-14 and GR-22 are in the proposed game), the sample's spells on every bar
   that casts them (ch14Slots), and every damage and XP cap full without the protection rows (they wait on CORE-4's rating row, FR-12). Best-gear
   layer pieces are its BiS four. The dial pick reads it beside `deaths`; a band that moves between the two is chapter 14 content to re-size at
   its own rows. No seat wears fists yet: the matrix has no fist way (FR-5 adds it), so the fist switch moves the tables and no cell */
export const CH14_CAPS = Object.freeze({ id: 'caps', levels: Object.freeze([60, 185]), comps: compsOf(4), gears: ['mid'], tiers: ['dangerous', 'hardest'],
  variants: Object.freeze([Object.freeze({ tag: 'buff:caps-no-protection', buffs: Object.freeze([Object.freeze({ type: 'damage', magnitude: 15 }), Object.freeze({ type: 'level_xp', magnitude: 30 })]) })]) });
/* the store rune of the tier a skill level casts and the runes a hero owns of a family (the played bar's rule: played.mjs RUNE_TIERS, the game's rune gates) */
const RUNE_TIER_AT = PLAYED_RUNE_TIERS;
const ch14Spell = (id, family, lv, conditions = []) => {
  const t = RUNE_TIER_AT.find(([l]) => lv >= l)[1];
  return { id: 'p_' + id, join: 'and', conditions, action: { id, type: 'ability', own: RUNE_TIER_AT.map(([, x]) => x + '_' + family + '_rune').reverse(), store: t === 'chalked' ? 'plain_' + family + '_rune' : 'plain_' + t + '_' + family + '_rune', onEmpty: 'store' } };
};
const AOE2 = Object.freeze([Object.freeze({ op: 'gte', value: 2, metric: 'enemies_in_aoe' })]);
/** The sample's spells a party's bars carry (cell.mjs addSlots, by role): the Mage Updraft from Magic 25 and Blight from 40, after Hoarfrost, on two
    in reach; the shield tank Brand from Melee 25 and Reave from 40, after Turning Cut (they stand in for a strike: abilities.js replaces). */
export function ch14Slots(styles, skillsBySeat) {
  const out = {}, seat = (st) => styles.indexOf(st);
  if (seat('mage') >= 0) { const lv = ((skillsBySeat || [])[seat('mage')] || {}).magic || 1; const sl = [...(lv >= 25 ? [ch14Spell('updraft', 'storm', lv, AOE2)] : []), ...(lv >= 40 ? [ch14Spell('blight', 'bone', lv, AOE2)] : [])]; if (sl.length) out.mage = { after: 'hoarfrost', slots: sl }; }
  if (seat('tank') >= 0) { const lv = ((skillsBySeat || [])[seat('tank')] || {}).melee || 1; const sl = [...(lv >= 25 ? [ch14Spell('brand', 'storm', lv)] : []), ...(lv >= 40 ? [ch14Spell('reave', 'bone', lv)] : [])]; if (sl.length) out.tank = { after: 'turning_cut', slots: sl }; }
  return out;
}

/* THE RUNS. `blocks` name what each plays; a block's levels default to the run's, its seeds too (`seeds` on a block plays it on more). */
export const RUNS = Object.freeze({
  /* the nightly matrix: every axis at every checkpoint and the high Levels, the grid's sample */
  full: Object.freeze({ id: 'full', levels: Object.freeze([...STD.CHECKPOINTS, ...HIGH_LEVELS]), seeds: 2, hours: 2, blocks: Object.freeze([
    { id: 'ways', comps: WAYS.map(lone), gears: STD.GEAR_STATE_IDS, tiers: 'all' },
    { id: 'parties', comps: [2, 3, 4].flatMap((n) => compsOf(n)), gears: STD.GEAR_STATE_IDS, tiers: 'all' },
    { id: 'steps', comps: [lone('hammer'), ...compsOf(4)], steps: true, tiers: ['normal'] },
    LINEUP_BLOCK,
    BUFF_BLOCK, BINDS_BLOCK, TRACKS_BLOCK, TALENT_BLOCK, LEAVE_BLOCK,
    { id: 'grounds', grounds: true },
  ]) }),
  /* the representative subset (a --diff in a few minutes): every way, every gear state, lone and four, Normal, Dangerous and the hardest tier, every
     slot class's step, early to Level 5,000. TWO seeds an hour (the critical review's step 1: one seed for one hour is no longer the subset);
     a diff plays the same dice before and after, so a change reads as a pair. */
  subset: Object.freeze({ id: 'subset', levels: Object.freeze([10, 30, 60, 110, 185, 400, ...HIGH_LEVELS]), seeds: 2, hours: 1, blocks: Object.freeze([
    { id: 'ways', comps: WAYS.map(lone), gears: ['mid'], tiers: ['normal'] },
    { id: 'gear', comps: [lone('hammer')], gears: ['low', 'bis'], tiers: ['normal'] },
    { id: 'tier', comps: [lone('hammer')], gears: ['mid'], tiers: ['dangerous', 'hardest'] },
    { id: 'four', comps: compsOf(4), gears: STD.GEAR_STATE_IDS, tiers: ['normal', 'dangerous', 'hardest'] },
    { id: 'steps', comps: [lone('hammer')], steps: true, tiers: ['normal'] },
    LINEUP_BLOCK,
    BUFF_BLOCK, BINDS_BLOCK, TRACKS_BLOCK, TALENT_BLOCK, LEAVE_BLOCK,
  ]) }),
  deaths: DEATHS,
  /* `--run deaths-full`: the death sample with chapter 14's full-game block (CH14 above); `patch` plays on top of the run's base */
  'deaths-full': Object.freeze({ ...DEATHS, id: 'deaths-full', patch: 'patches/ch14-full-game.json', ch14: true, blocks: Object.freeze([...DEATHS.blocks, CH14_CAPS]) }),
  /* ONE TALENTS UNLOCK IN A CELL (13-build-plan.md D-9; 10-level-choices.md section 4): Force's rank 3 unlock, Focus fire (+6% on a monster another
     hero of the party is attacking), on every seat of the MID four beside the same four without it, at Levels 30, 60 and 110 on Normal and the hardest
     tier. The engine has no seam for it (the modifier table's when column, R20), so the run plays patches/tal-focus-fire.json on its scratch copy */
  unlock: Object.freeze({ id: 'unlock', levels: Object.freeze([30, 60, 110]), seeds: 2, hours: 2, patch: 'patches/tal-focus-fire.json', blocks: Object.freeze([
    { id: 'four', comps: compsOf(4), gears: ['mid'], tiers: ['normal', 'hardest'] },
    { id: 'unlock', comps: compsOf(4), gears: ['mid'], tiers: ['normal', 'hardest'], variants: [{ tag: 'unlock:focusFire', unlocks: { focusFire: 60 } }] },
  ]) }),
  /* Balance Lab v3's LIVE cells (a slider move re-plays them in the browser, on the bundled engine): every way alone and the four on every tier,
     MID, early, at the end of open content and PROJECTED, a quarter hour on one seed. tools/balance-lab/build.mjs --v3
     resolves them (cell.mjs resolveOnly) so the page plays the matrix's own seats. */
  live: Object.freeze({ id: 'live', levels: Object.freeze([30, 110, 400]), seeds: 1, hours: 0.25, blocks: Object.freeze([
    { id: 'ways', comps: WAYS.map(lone), gears: ['mid'], tiers: ['normal'] },
    { id: 'four', comps: compsOf(4), gears: ['mid'], tiers: ['normal', 'dangerous', 'hardest'] },
  ]) }),
});

/** A variant block's cells for one party: [{ tag, opts }] (buildCell options), its variants, or one a build track that suits these ways. */
function variantsOf(block, styles, hours) {
  if (block.tracks) return readTracks().tracks.filter((t) => !(t.styles || []).length || styles.every((s) => t.styles.includes(s))).map((t) => ({ tag: 'track:' + t.id, opts: { track: t } }));
  return block.variants.map(({ tag, staminaShare, ...opts }) => ({ tag, opts: { ...opts, ...(Number.isFinite(staminaShare) ? { staminaH: staminaShare * hours } : {}) } }));
}

/** A tier list resolved on a ground: 'all', ['normal', 'hardest'] ... -> the ids it offers. */
function tiersFor(D, ground, want) {
  const offered = D.TI.tiersOf(ground);
  if (want === 'all') return offered;
  return [...new Set(want.map((t) => (t === 'hardest' ? offered[offered.length - 1] : t)).filter((t) => offered.includes(t)))];
}

/**
 * A step cell: `built` (buildCell's answer for the upper state) with the slot class taken from the lower state's plans. The seats keep
 * the upper state's skills (only the gear moves: the grid's E1 step), the temper rungs and projected rows follow the mixed plans.
 */
export function stepCell(D, K, built, { L, gear, from, styles, ground, slots }) {
  const skills = built.cell.skillsBySeat;
  const lower = styles.map((style, i) => K.kitFor(L, from, style, { ground, mainSkill: skills[i][MAIN[style] || 'melee'] }));
  const plans = built.plans.map((p, i) => K.mixPlan(p, lower[i], slots));
  const temperSteps = {};
  for (const p of plans) for (const [k, n] of Object.entries(p.temperSteps || {})) temperSteps[k] = Math.max(temperSteps[k] || 0, n);
  const { temperSteps: _t, ...rest } = built.cell;
  void _t;
  const cell = { ...rest, gearBySeat: plans.map((p) => p.gear), ...(Object.keys(temperSteps).length ? { temperSteps } : {}) };
  let whatIf = built.whatIf;
  if (whatIf) {
    const items = {};
    for (const p of plans) Object.assign(items, p.whatIfItems || {});
    const { items: _i, ...w } = whatIf;
    void _i;
    whatIf = { ...w, ...(Object.keys(items).length ? { items } : {}) };
  }
  void gear;
  return { cell, whatIf, plans };
}

/* ── A PATCH'S PLAN STEPS (proposals that change what a cell wears, not a number in src: proposals.mjs) ──────────────────────────── */
/** The gear curve's band at or under Level L (60 G-4: from 110, every +24%), `back` bands under it; null under the first band. */
export function curveBand(L, g, back = 0) {
  if (L < g.from) return null;
  const k = Math.floor(Math.log(L / g.from) / Math.log(g.step) + 1e-9) - back;
  return k < 0 ? null : Math.round(g.from * g.step ** k);
}
/**
 * THE GEAR CURVE (R10, proposals GR-4): from its first band a MID or BiS seat's weapon and armor are the line (grid-project.mjs lineKit:
 * the Dawnsteel row with its numbers at the band's Level), LOW one band back; shields, spellbooks, jewelry and the rest stay the kit's.
 * Changes `built` (a buildCell answer) in place: the seats' explicit sets, the plans' kits and the what-if items.
 */
export function applyGearCurve(K, built, meta, g) {
  const R = curveBand(meta.L, g, meta.gear === 'low' ? 1 : 0);
  if (!R) return built;
  /* a step cell (one slot class a state back): that class one band back on the curve, where there is a band back */
  const back = meta.stepClass === 'weapon' || meta.stepClass === 'armor' ? curveBand(meta.L, g, meta.gear === 'low' ? 2 : 1) : null;
  const ARMOR = UPGRADE_CLASSES.armor;
  const items = {};
  built.cell.gearBySeat = built.cell.gearBySeat.map((gear, i) => {
    const line = lineKit(K.LINES, STYLES[meta.styles[i]], R);
    if (back) {
      const lb = lineKit(K.LINES, STYLES[meta.styles[i]], back);
      for (const [slot, id] of Object.entries(lb.set)) if (meta.stepClass === 'weapon' ? slot === 'weapon' : ARMOR.includes(slot)) { line.set[slot] = id; line.items[id] = lb.items[id]; }
    }
    Object.assign(items, line.items);
    built.plans[i] = { ...built.plans[i], kit: { ...built.plans[i].kit, ...line.set } };
    return { ...gear, also: { ...(gear.also || {}), ...line.set } };
  });
  built.whatIf = { ...(built.whatIf || {}), items: { ...((built.whatIf && built.whatIf.items) || {}), ...items } };
  return built;
}
/**
 * GR-38'S STAND-IN BY LEVEL (D-3 ruling 6, 08-designer-d3.md section 1.4): patches/items-2.json's tier 7 numbers play only from `js.from` (Level
 * 110), times the scale of the cell's Level (0.5 to 185, 1 from 186); under it the four rows play as the tree holds them (K.ITEMS is the tree's).
 * A what-if on the cell's item rows: the scratch copy keeps the patched rows, the cell reads its Level's.
 */
export function applyJewelryStandIn(K, built, meta, js) {
  const f = meta.L < js.from ? null : [...js.scale].reverse().find(([l]) => meta.L >= l)[1];
  const items = {};
  for (const [id, row] of Object.entries(js.rows)) {
    items[id] = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, f === null ? (K.ITEMS[id] && typeof K.ITEMS[id][k] === 'number' ? K.ITEMS[id][k] : 0) : k === 'critB' ? v * f : Math.round(v * f)]));
  }
  built.whatIf = { ...(built.whatIf || {}), items: { ...((built.whatIf && built.whatIf.items) || {}), ...items } };
  return built;
}
const applyPlan = (K, built, meta, plan) => {
  let b = built;
  if (plan && plan.gearCurve) b = applyGearCurve(K, b, meta, plan.gearCurve);
  if (plan && plan.jewelryStandIn) b = applyJewelryStandIn(K, b, meta, plan.jewelryStandIn);
  return b;
};

/**
 * Every cell of a run: { cells: [meta], jobs: [{ id, key, cell, whatIf }] }. `D` the grid's data (loadGridData), `K` its kits. `only`
 * keeps those Levels; `blocks` those block ids; `plan` a patch's plan steps (applyPlan).
 */
export function planMatrix(D, K, run, o = {}) {
  const cells = [], jobs = [], seen = new Set();
  const hours = o.hours || run.hours;
  const add = (meta, b0) => {
    if (seen.has(meta.key)) return;
    seen.add(meta.key);
    const b = applyPlan(K, b0, meta, o.plan);
    /* chapter 14's full-game block: the sample's spells on the bars that cast them */
    if (run.ch14) { const add = ch14Slots(meta.styles, b.cell.skillsBySeat); if (Object.keys(add).length) b.cell = { ...b.cell, addSlots: add }; }
    /* the seeds: the caller's, else the block's, else the run's */
    const seeds = o.seeds || meta.seeds || run.seeds;
    /* `skills`: each seat's main skill and Defense as played (the career line, skill-lines.mjs, and the gear state's offset) */
    cells.push({ ...meta, seeds, stretch: STD.stretchOf(meta.L).state, kits: b.plans.map((p) => ({ style: p.style, kit: p.kit, temperSteps: p.temperSteps })),
      skills: meta.styles.map((st, i) => { const sk = (b.cell.skillsBySeat || [])[i] || {}; return [sk[MAIN[st] || 'melee'] || null, sk.defense || null]; }) });
    for (let s = 0; s < seeds; s++) jobs.push({ id: meta.key + '#' + s, key: meta.key, whatIf: b.whatIf, cell: { ...b.cell, id: 'MATRIX:' + meta.key, hours, seeds: 1, seedBase: s } });
  };
  for (const block of run.blocks) {
    if (o.blocks && !o.blocks.includes(block.id)) continue;
    if (block.grounds) { planGrounds(D, K, add, block); continue; }
    if (block.talents) { planTalents(D, K, add, block, o); continue; }
    for (const L of block.levels || run.levels) {
      if (o.only && !o.only.includes(L)) continue;
      for (const [styles, comp] of block.comps) {
        const size = styles.length;
        if (size > 1 && L < (STD.PARTIES.find((p) => p.size === size).fromLevel || 1)) continue;
        const ground = D.groundAt(L, size);
        for (const tier of tiersFor(D, ground, block.tiers)) {
          if (block.steps) {
            for (const [from, to] of STEP_PAIRS) {
              const base = buildCell(D, K, { L, gear: to, styles, tier, ground });
              for (const [cls, slots] of Object.entries(UPGRADE_CLASSES)) {
                const step = stepId(to, cls), key = cellKey(L, to, size, comp, tier, step);
                add({ key, block: block.id, L, gear: to, party: size, comp, tier, ground, styles, step, stepFrom: from, stepClass: cls }, stepCell(D, K, base, { L, gear: to, from, styles, ground, slots }));
              }
            }
            continue;
          }
          for (const gear of block.gears) {
            const meta = { block: block.id, L, gear, party: size, comp, tier, ground, styles, ...(block.seeds ? { seeds: block.seeds } : {}) };
            if (block.variants || block.tracks) {
              for (const v of variantsOf(block, styles, hours)) add({ ...meta, key: cellKey(L, gear, size, comp, tier, v.tag), step: v.tag, variant: v.tag }, buildCell(D, K, { L, gear, styles, tier, ground, ...v.opts }));
              continue;
            }
            add({ ...meta, key: cellKey(L, gear, size, comp, tier) }, buildCell(D, K, { L, gear, styles, tier, ground }));
          }
        }
      }
    }
  }
  return { cells, jobs };
}

/* THE TALENT BUILDS (TALENT_BLOCK): each seat list at each Level on each of its builds, on the ground the game advises for its size */
function planTalents(D, K, add, block, o) {
  for (const L of block.levels) {
    if (o.only && !o.only.includes(L)) continue;
    for (const seat of block.seats) {
      const size = seat.styles.length, ground = D.groundAt(L, size);
      if (block.minSize && size < block.minSize) continue;
      if (size > 1 && L < (STD.PARTIES.find((p) => p.size === size).fromLevel || 1)) continue;
      for (const tier of tiersFor(D, ground, [seat.tier])) for (const build of seat.builds) {
        const tag = 'build:' + build;
        add({ key: cellKey(L, 'mid', size, seat.comp, tier, tag), block: block.id, L, gear: 'mid', party: size, comp: seat.comp, tier, ground, styles: seat.styles, step: tag, variant: tag, build },
          buildCell(D, K, { L, gear: 'mid', styles: seat.styles, tier, ground, build }));
      }
    }
  }
}

/* THE GROUND AXIS (atlas/rates.mjs measureJobs' cells, built by the grid's buildCell so its pulls, kits and skills are the grid's): every hunt
   ground at both ends of its band, every party of 50-standards 1.3, every tier, MID. Key: G|ground|L|mid|size:comp|tier. `block.quick`: sizes
   1 and 4, one composition, Normal and the hardest tier (measureJobs' quick); `block.only`: those grounds. The death sample's (RUNS.deaths):
   `sizes` those party sizes, `firstComp` each size's first composition, `tiers` those tiers ('hardest' resolved per ground). */
function planGrounds(D, K, add, block = {}) {
  for (const g of huntGrounds(D.G.HUNT_GROUNDS, D.HUNT_INDEX)) {
    if (block.only && !block.only.includes(g)) continue;
    for (const L of bandEnds(D.HUNT_INDEX, g, D.G.HUNT_GROUNDS[g])) for (const pc of partyComps(STD.PARTIES, !!block.quick)) {
      if (L < pc.fromLevel && pc.size > 1) continue;
      if (block.sizes && !block.sizes.includes(pc.size)) continue;
      pc.comps.forEach((styles, ci) => {
        if (block.firstComp && ci > 0) return;
        for (const tier of block.tiers ? tiersFor(D, g, block.tiers) : block.quick ? tiersFor(D, g, ['normal', 'hardest']) : D.TI.tiersOf(g)) {
          const comp = styles.map((s) => s[0]).join('') + ci;
          const key = ['G', g, L, 'mid', pc.size + ':' + comp, tier].join('|');
          add({ key, block: 'grounds', L, gear: 'mid', party: pc.size, comp, compIndex: ci, tier, ground: g, styles }, buildCell(D, K, { L, gear: 'mid', styles, tier, ground: g }));
        }
      });
    }
  }
}

/* ── THE ARCHETYPE RULE (the header) ───────────────────────────────────────────────────────────────────────────────────────────── */
/** monster id -> { role, shape, cls }, from the data at hand (`BS` balance-sheet.js, `MONSTERS`). */
export function archetypeTable(BS, MONSTERS) {
  const role = {};
  for (const roster of Object.values(BS.GROUND_ROSTER)) for (const [id, r] of Object.entries(roster)) if (!role[id]) role[id] = r;
  const out = {};
  for (const [id, m] of Object.entries(MONSTERS)) {
    out[id] = { role: role[id] || (m.boss ? 'boss' : 'unrostered'), shape: Array.isArray(m.spells) && m.spells.length ? 'caster' : Number(m.range) > 1 ? 'ranged' : 'melee', cls: m.cls || 'none' };
  }
  return out;
}
export const ARCHETYPE_AXES = Object.freeze(['role', 'shape', 'cls']);
