// tests/hunt-core/hall-formula.mjs — A HALL'S BOSSES ON THE FORMULA (src/core/hunt/hall-formula.js; lane/hall-formula, 2026-11-23). Run by run-all.mjs.
//
//   derive  with Krell's Hall's switch on, Lord Krell (kind hall) and Captain Hask (a named add, kind add) stand at their kind's stat role read by
//           the one stat formula (balance-sheet.js formulaStats) at their own Level, the hall's band floor and the room's groupFit; their content
//           (name, elements, spells, phases, drops, coin, XP, boss kind) is their row's; a plain add (no kind) has no derived row.
//   door    the instance's one door (combat-sim.js huntPlayOf) hands the hall's table, so the settle and the browser's live view read the formula
//           rows; no other ground's play moves (every hunting, called, training and run ground reads no hall table).
//   kinds   the boss kinds' to-hit lever (BOSS_KINDS hitPm) moves only the kinds that set it: the ground boss's stat role is the elite's
//           to-hit, as before the lever.
//   off     with the switch off (the pack's `formula` line gone) the hall reads exactly its hand rows: no table, Krell's catalogue row.
//   play    THE ONE ENGINE (CLAUDE.md section 6): a tank, a healer and two damage at Level 98 fight the hall on the formula through the real settle,
//           and the fight ends the same, viewed or closed (one ten-minute window or thirty-second windows).
//   mutants each rule planted back, each caught by its own case.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadCore, plant, makeReport } from './fixtures/h1.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const load = async (root) => {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.hf = await imp('src/core/hunt/hall-formula.js');
  M.bosses = await imp('src/data/bosses.js');
  M.BS = await imp('src/data/balance-sheet.js');
  M.halls = await imp('src/data/boss-halls.js');
  return M;
};
const HUNT = 'krells_hold_hall';
const OFF = ['src/data/grounds/krells_hold/pack.js', '    formula: true,\n', ''];
const STATS = ['hp', 'atk', 'aim', 'evasion', 'def'];
const CONTENT = ['name', 'level', 'tier', 'cls', 'xp', 'gp', 'drops', 'spells', 'phases', 'elements', 'speed', 'bossKind', 'boss', 'add'];

/* the formula's stats for row `row` at boss kind `kind` (the test's own reading of the rule, not the module's) */
function want(M, row, kind) {
  const base = M.BS.MONSTER_ROLES[M.bosses.BOSS_KINDS[kind].role];
  return M.BS.formulaStats({ level: row.level, role: 'k', tier: row.tier, floor: 85, fit: 'party', ground: HUNT }, { roles: { ...M.BS.MONSTER_ROLES, k: M.bosses.bossRole(base, kind) } });
}

const CASES = {
  derive(M) {
    if (!M.hf.hallFormulaOn(HUNT)) return 'CONTROL: Krell\'s Hall ships with its switch off';
    for (const [id, kind] of [['lord_krell', 'hall'], ['hall_hask', 'add']]) {
      const row = M.MONSTERS[id], d = M.hf.hallRow(row, HUNT);
      if (M.bosses.bossKindOf(row) !== kind) return id + ' is boss kind ' + M.bosses.bossKindOf(row) + ', not ' + kind;
      if (!d) return id + ' has no derived row';
      const w = want(M, row, kind);
      for (const k of STATS) if (d[k] !== w[k]) return id + ' ' + k + ' reads ' + d[k] + ', the formula at kind ' + kind + ' says ' + w[k];
      for (const k of CONTENT) if (JSON.stringify(d[k]) !== JSON.stringify(row[k])) return id + ' lost its own ' + k + ' (' + JSON.stringify(row[k]) + ' -> ' + JSON.stringify(d[k]) + ')';
    }
    if (M.hf.hallRow(M.MONSTERS.hall_grave_guard, HUNT)) return 'a plain add (no boss kind) has a derived row';
    if (M.hf.hallRow(M.MONSTERS.lord_krell, 'krells_hold')) return 'a derived row off the hall room (the hunting ground)';
    return null;
  },
  door(M) {
    const t = M.cs.huntPlayOf(HUNT, null).monsters;
    if (!t) return 'the hall\'s play hands no table with its switch on';
    for (const id of ['lord_krell', 'hall_hask']) if (t[id].hp !== M.hf.hallRow(M.MONSTERS[id], HUNT).hp) return 'the door hands ' + id + ' at ' + t[id].hp + ' HP, not his derived row';
    if (t.hall_grave_guard !== M.MONSTERS.hall_grave_guard) return 'the door moved a plain add';
    const G = M.grounds;
    for (const id of [...Object.keys(G.HUNT_GROUNDS), ...Object.keys(G.CALLED_GROUNDS || {}), ...Object.keys(G.TRAINING_GROUNDS || {})]) {
      if (M.hf.hallTable(id, M.MONSTERS)) return 'ground ' + id + ' (no hall room) reads a hall table';
    }
    return null;
  },
  kinds(M) {
    const elite = M.BS.MONSTER_ROLES.elite;
    if (M.BS.MONSTER_ROLES.boss.hit !== elite.hit) return 'the ground boss\'s to-hit moved (' + M.BS.MONSTER_ROLES.boss.hit + ', the elite\'s ' + elite.hit + ')';
    for (const [id, k] of Object.entries(M.bosses.BOSS_KINDS)) {
      const r = M.bosses.bossRole(elite, id);
      if (Math.abs(r.hit - (elite.hit + k.hitPm / 1000)) > 1e-9) return 'kind ' + id + ' to-hit reads ' + r.hit + ', not the elite\'s plus its hitPm';
    }
    return M.bosses.validateBosses().join('; ') || null;
  },
  off(M) {
    if (M.hf.hallFormulaOn(HUNT)) return 'the switch reads on with the pack\'s formula line gone';
    if (M.hf.hallTable(HUNT, M.MONSTERS)) return 'a table with the switch off';
    const t = M.cs.huntPlayOf(HUNT, null).monsters;
    if (t && t.lord_krell.hp !== M.MONSTERS.lord_krell.hp) return 'with the switch off the door hands Krell at ' + t.lord_krell.hp + ' HP, his row ' + M.MONSTERS.lord_krell.hp;
    return null;
  },
};

/* one fight, the geared four on the hall card's food: how it ended, when, and the hero deaths */
function fight(P, M, windowMs) {
  let how = null, at = 0, deaths = 0;
  P.run(HUNT, 98, ['tank', 'healer', 'melee_dps', 'mage'], { ground: M.grounds.HALL_GROUNDS[HUNT], spanMs: 630000, windowMs, leaveTogether: true, fullSet: true,
    onWindow: (o) => { for (const p of o.members) { if (p.hunt.ended && !how) { how = p.hunt.ended.reason; at = p.hunt.ended.at; } deaths += (p.summary.deathLog || []).length; } } });
  return { how, at, deaths };
}
async function playCase(root) {
  const P = await loadPlay(root);
  const M = await load(root);
  if (!M.hf.hallFormulaOn(HUNT)) return 'CONTROL: the play needs the switch on';
  const one = fight(P, M, 600000), many = fight(P, M, 30000);
  if (!one.how) return 'CONTROL: the fight never ended in ten and a half minutes';
  if (one.how !== many.how || one.at !== many.at || one.deaths !== many.deaths) return 'the fight moved with 30-second windows (viewed or closed are not one fight): ' + JSON.stringify(one) + ' vs ' + JSON.stringify(many);
  return null;
}

const MUTANTS = [
  { name: 'the switch is always on', case: 'off', off: true, edits: [['src/core/hunt/hall-formula.js', 'return !!r && r.hall.formula === true;', 'return !!r;']] },
  { name: 'the switch never reaches the hall row', case: 'derive', edits: [['src/data/boss-halls.js', "...(p.hall.formula === true ? { formula: true } : {})", '...{}']] },
  { name: 'the door skips the hall table', case: 'door', edits: [['src/core/combat-sim.js', 'monsters: hallTable(groundId, MONSTERS) || groundDropsOn(groundId, MONSTERS)', 'monsters: groundDropsOn(groundId, MONSTERS)']] },
  { name: 'a derived row drops its content', case: 'derive', edits: [['src/core/hunt/hall-formula.js', 'return Object.freeze({ ...row, hp: s.hp,', 'return Object.freeze({ tier: row.tier, hp: s.hp,']] },
  { name: 'the hall reads the ground boss kind', case: 'derive', edits: [['src/core/hunt/hall-formula.js', "role: 'kind:' + kind,", "role: 'kind:ground',"]] },
  { name: 'the formula ignores the room\'s groupFit', case: 'derive', edits: [['src/core/hunt/hall-formula.js', "fit: r.ground.groupFit || 'party',", "fit: 'both',"]] },
  { name: 'a plain add is derived', case: 'derive', edits: [['src/core/hunt/hall-formula.js', 'const kind = bossKindOf(row);', "const kind = bossKindOf(row) || 'add';"]] },
  { name: 'the to-hit lever is dropped', case: 'kinds', edits: [['src/data/bosses.js', 'hit: (base.hit || 0) + k.hitPm / 1000 };', 'hit: base.hit };']] },
];

const R = makeReport('hunt-core/hall-formula');
const P_OFF = plant([OFF]);
try {
  const M = await load(ROOT), Moff = await load(P_OFF.root);
  for (const [cn, fn] of Object.entries(CASES)) {
    let why = null;
    try { why = fn(cn === 'off' ? Moff : M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
  }
  let why = null;
  try { why = await playCase(ROOT); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, 'play: ' + why);
} finally { P_OFF.done(); }
for (const mu of MUTANTS) {
  const p = plant(mu.off ? [OFF, ...mu.edits] : mu.edits);
  try {
    let why = null;
    try { why = CASES[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(CASES).length + ' cases + play, ' + MUTANTS.length + ' mutants caught');
R.finish();
