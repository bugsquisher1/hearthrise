// tools/balance-sim/armor-power.mjs — A PIECE OF ARMOR'S POWER ON A GROUND, read off the engine's own rolls (designer,
// lane/d-armor-line-v2; the armor line past Dawnsteel, tools/balance-sim/staged/armor-line.js, PRIORITY_BOARD "2026-11-16 The armor line past
// Dawnsteel, as a budget"). The weapon line's measure (weapon-power.mjs) for the other half of a hero.
//
// The armor line is a budget: a unique worn from Level R may spend it any way it likes (less armor and an element resistance, less
// armor and more of its weight's style numbers, more armor and a bigger penalty), as long as its power on every ground from the
// line's anchor up stays under the line's piece of its slot and weight there. This is the one measure of that power, shared by the
// guard (tests/armor-line.mjs) and the grader's `--uniques` pick (gear.mjs), so the two can't rank a piece differently.
//
// THE HERO. A hero of Level L (every combat skill at L, the harness default) of the piece's weight: plate swings the Dawnsteel Sword,
// leather the Duskwood Bow, cloth the Duskwood Wand and Codex. The other five armor slots wear a CONTEXT set ('line': the line's pieces
// at Level R, so a piece is held to swapping one line piece out; 'dawn': Dawnsteel, fully tempered when asked, the set a hero has when
// the first unique drops). No shield, cape or jewelry: the number is the armor's own.
//
// THE TWO READS, over the ground's spawn (w the pack's spawn weight, HUNT_INDEX spawns):
//   PACE    kills a swing: sum(w) / sum(w x hp / E_m), E_m the hero's expected blow on monster m (src/core/combat.js playerCombatRolls
//           with the whole set worn, so a leather piece's Ranged and critical chance and a cloth piece's Magic count; crit by applyCrit).
//   DAMAGE  what reaches the hero a swing, weighted by how long each head lives (w x hp / E_m): its basic blow (monsterAccuracy against
//           the hero's Defense, then the armor chain as src/core/hunt/damage.js hurt plays it: dodge, absorb, the element, ward, the
//           Tempering cut, the total cap's floor, at least 1), and each spell it casts (one cast every cdMs; a group spell lands on
//           everyone, a marked one on a melee hero only, who holds it; the roll lo..top of spellHit; dodge and the chain the same,
//           with the hero's resistance to the spell's element). SAFETY is 1 / DAMAGE: the low point and the food bill.
// A piece's two ratios are its PACE and SAFETY over a reference piece's in the same context (the line's piece for the ceiling, the
// context's own piece for "wins"), and its SCORE their mean (the weapon line's rank).
//
//   node tools/balance-sim/armor-power.mjs     the sample against the line on every late ground, who wins where against tempered
//                                              Dawnsteel, and the line's first Level over tempered Dawnsteel by weight
//
// Pure reader: it changes no table. `armorPower(mods)` takes the module instances it reads, so the grader passes the engine's own.
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';

export const SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);
/* the hero each weight is read on: its weapon (and off-hand), its basic blow's profile; `melee` holds a marked spell */
export const WEARER = Object.freeze({
  plate: Object.freeze({ weapon: 'dawn_sword', melee: true }),
  leather: Object.freeze({ weapon: 'duskwood_bow', melee: false }),
  cloth: Object.freeze({ weapon: 'duskwood_wand', shield: 'duskwood_codex', melee: false }),
});

/**
 * The power measure on the given module instances.
 * mods: { ITEMS, MONSTERS, HUNT_GROUNDS, HUNT_INDEX, combat, mitigation, elements, spells, monsterLevelOf,
 *         deriveProfile, skillXpForLevel, line (tools/balance-sim/staged/armor-line.js) }
 */
export function armorPower(mods) {
  const { DANGER_GROUNDS = {} } = mods;
  const { ITEMS, MONSTERS, HUNT_GROUNDS, HUNT_INDEX, combat, mitigation, elements, spells, monsterLevelOf, deriveProfile, skillXpForLevel, line } = mods;
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const TICK = combat.COMBAT_BALANCE.tickMs;
  const CAP = mods.capPm;
  const skillsAt = (L) => ({ melee: skillXpForLevel('melee', L), ranged: skillXpForLevel('ranged', L), magic: skillXpForLevel('magic', L), defense: skillXpForLevel('defense', L) });
  /* the old Armor rungs retired with lane/tp-im-steps: Temper on steps is item Levels in the gear part, which this reader does not play, so
     "tempered" Dawnsteel reads as Dawnsteel (no cut) */
  const fullTemper = () => null;
  const spawnsOf = (gid) => {
    const g = HUNT_GROUNDS[gid], h = g && HUNT_INDEX[g.hunt];
    return (h && h.spawns || []).filter((s) => MONSTERS[s.monster] && s.w > 0);
  };
  /** The line's piece of `slot` and `weight` at Level R as a full row: its Dawnsteel base with the line's armor. */
  function lineRow(slot, weight, R) {
    const b = line.LINE_BASE[weight], id = b && b.ids[slot];
    if (!id || !ITEMS[id]) return null;
    return { ...ITEMS[id], defB: line.lineArmor(slot, weight, R), reqLv: Math.max(Number(ITEMS[id].reqLv) || 1, Number(R) || 1) };
  }
  const dawnRow = (slot, weight) => { const b = line.LINE_BASE[weight]; return b && ITEMS[b.ids[slot]] ? ITEMS[b.ids[slot]] : null; };
  /** A worn table: { items, equipment } with `row` in `slot` and the context elsewhere ('line' at R, or 'dawn'). */
  function wornWith(row, weight, ctx, R) {
    const W = WEARER[weight], items = {}, equipment = {};
    items[W.weapon] = ITEMS[W.weapon]; equipment.weapon = W.weapon;
    if (W.shield) { items[W.shield] = ITEMS[W.shield]; equipment.shield = W.shield; }
    for (const s of SLOTS) {
      const r = s === row.slot ? row : ctx === 'line' ? lineRow(s, weight, R) : dawnRow(s, weight);
      if (!r) continue;
      const id = '__' + s;
      items[id] = r; equipment[s] = id;
    }
    return { items, equipment };
  }
  /* the mean of what one landed blow of raw n..hi leaves, through the chain (src/core/mitigation.js mitigate, its Tempering draw's mean) */
  function meanTaken(lo, hi, el, mit, armorPm) {
    let s = 0, k = 0;
    for (let raw = Math.max(0, lo); raw <= hi; raw++) {
      let x = raw - Math.floor((raw * (mit.absorbPm || 0)) / 1000);
      x = Math.floor((x * el) / 1000);
      x -= Math.max(0, mit.ward || 0);
      if (armorPm && x > 0) x = (x * (1000 - armorPm)) / 1000;
      const keep = mit.keepPm || (armorPm ? 1000 - CAP : 0);
      const floor = keep ? Math.floor((Math.floor((raw * el) / 1000) * keep) / 1000) : 0;
      s += Math.max(1, floor, x); k++;
    }
    return k ? s / k : 0;
  }
  /** The hero in `worn` against ground gid at Level L: { pace (kills a swing), damage (taken a swing) }. temper: the hero's rungs. */
  function read(worn, gid, L, temper) {
    const { items, equipment } = worn, W = WEARER[items[equipment.weapon] ? Object.keys(WEARER).find((k) => WEARER[k].weapon === equipment.weapon) : 'plate'];
    const skills = skillsAt(L), eq = combat.equipmentStats(equipment, items), profile = deriveProfile(items[equipment.weapon].weaponType);
    const values = mitigation.armourValues(equipment, items);
    const armorPm = 0;
    const resist = eq.resistPm || null;
    let kills = 0, time = 0, hurt = 0;
    for (const s of spawnsOf(gid)) {
      const m = MONSTERS[s.monster];
      const r = combat.playerCombatRolls(m, { items, equipment, eq, skills, profile });
      const M = Math.max(1, r.maxHit), c = r.critChance || 0;
      let bs = 0;
      for (let d = 1; d <= M; d++) bs += (1 - c) * d + c * combat.applyCrit(d);
      const E = Math.max(1e-9, r.accuracy * bs / M), t = s.w * m.hp / E;
      kills += s.w; time += t;
      const mit = mitigation.mitigationOf(values, monsterLevelOf(m)), hitThrough = 1 - (mit.dodgePm || 0) / 1000;
      const mr = combat.monsterCombatRolls(m, { eq, skills });
      let d = mr.accuracy * hitThrough * meanTaken(1, Math.max(1, mr.maxHit), 1000, mit, armorPm);
      for (const id of m.spells || []) {
        const sp = spells.spellRow(id);
        if (!sp || spells.mends(sp) || (spells.marked(sp) && !W.melee)) continue;
        const [lo, top] = spells.spellHit(combat.monsterMaxHit(m), sp);
        const el = sp.element ? elements.heroElementPermille(resist, sp.element) : 1000;
        d += (TICK / sp.cdMs) * hitThrough * meanTaken(lo, top, el, mit, armorPm);
      }
      hurt += t * d;
    }
    return time > 0 ? { pace: kills / time, damage: hurt / time } : null;
  }
  const weightOf = (row) => (row && line.LINE_BASE[row.armourClass] ? row.armourClass : null);
  /** `row`'s pace and safety over `ref`'s, each worn in `slot` of the same context: { pace, safety, score }. */
  function versus(row, ref, gid, L, ctx, R, temper, weight = weightOf(row)) {
    const a = read(wornWith(row, weight, ctx, R), gid, L, temper), b = read(wornWith(ref, weight, ctx, R), gid, L, temper);
    if (!a || !b) return null;
    const pace = a.pace / b.pace, safety = b.damage / a.damage;
    return { pace, safety, score: (pace + safety) / 2 };
  }
  /** Every ground the line answers to: its band starts at the line's anchor or later (open or staged), by its floor. Never a Danger-scale
      ground (src/data/danger.js DANGER_GROUNDS, lane/r10-more-grounds): there a piece is its item Level, the one base the ground drops
      (12-targets.md 8), so a stat budget has nothing to answer to (the Catacombs' wings are cut from the Unmarked Catacombs, measured here). */
  function lateGrounds() {
    return Object.entries(HUNT_GROUNDS)
      .filter(([gid, g]) => g && !own(DANGER_GROUNDS, gid) && own(HUNT_INDEX, g.hunt) && HUNT_INDEX[g.hunt].band && HUNT_INDEX[g.hunt].band[0] >= line.LINE_ANCHOR_LEVEL)
      .sort((a, b) => HUNT_INDEX[a[1].hunt].band[0] - HUNT_INDEX[b[1].hunt].band[0] || (a[0] < b[0] ? -1 : 1)).map(([gid]) => gid);
  }
  const bandOf = (gid) => HUNT_INDEX[HUNT_GROUNDS[gid].hunt].band;
  /** The Level a hero wearing a piece from R meets ground gid at: R on a ground it can already hunt, else the ground's floor. */
  const levelOn = (gid, R) => Math.max(Number(R), bandOf(gid)[0]);
  /** The grounds a hero of Level R is sent to: the late grounds whose band holds R. */
  const huntedAt = (R, grounds = lateGrounds()) => grounds.filter((g) => bandOf(g)[0] <= R && R <= bandOf(g)[1]);
  /** THE CEILING: `row` against the line's piece of its slot and weight at its own Level R, on every late ground, worn by a hero of
      levelOn(g, R) with the line at R elsewhere: [{ ground, L, pace, safety, score }]. */
  function againstLine(row, R, grounds = lateGrounds()) {
    const ln = lineRow(row.slot, weightOf(row), R);
    return grounds.map((g) => ({ ground: g, L: levelOn(g, R), ...(ln ? versus(row, ln, g, levelOn(g, R), 'line', R, null) || {} : {}) }));
  }
  /** `row`'s score on ground gid at Level L in a Dawnsteel set (tempered: both tier-7 ladders full; its slot's Dawnsteel piece is 1). */
  function scoreOnDawn(row, gid, L, tempered = true, weight = weightOf(row)) {
    const ref = dawnRow(row.slot, weight);
    const v = ref ? versus(row, ref, gid, L, 'dawn', L, tempered ? fullTemper() : null, weight) : null;
    return v ? v.score : null;
  }
  /** THE LINE'S FIRST LEVEL for a weight: the lowest R from the anchor where the line's whole set is safer than fully tempered Dawnsteel on
      every late ground a hero of R is sent to (null: not by 200). Under it a unique wins only through its trade on its own ground. */
  function firstLevel(weight, grounds = lateGrounds()) {
    for (let R = line.LINE_ANCHOR_LEVEL; R <= 200; R++) {
      const gs = huntedAt(R, grounds);
      if (gs.length && gs.every((g) => setVsTemperedDawn(weight, R, g).safety > 1)) return R;
    }
    return null;
  }
  /** The whole set: the line at R against fully tempered Dawnsteel, a hero of weight at Level L on gid: { pace, safety } (the line's over Dawnsteel's). */
  function setVsTemperedDawn(weight, R, gid, L = R) {
    const W = WEARER[weight], mk = (rowOf) => {
      const items = { [W.weapon]: ITEMS[W.weapon] }, equipment = { weapon: W.weapon };
      if (W.shield) { items[W.shield] = ITEMS[W.shield]; equipment.shield = W.shield; }
      for (const s of SLOTS) { items['__' + s] = rowOf(s); equipment[s] = '__' + s; }
      return { items, equipment };
    };
    const a = read(mk((s) => lineRow(s, weight, R)), gid, L, null), b = read(mk((s) => dawnRow(s, weight)), gid, L, fullTemper());
    return { pace: a.pace / b.pace, safety: b.damage / a.damage };
  }
  return { read, wornWith, versus, againstLine, scoreOnDawn, setVsTemperedDawn, firstLevel, lateGrounds, huntedAt, levelOn, bandOf, lineRow, dawnRow, spawnsOf, fullTemper, weightOf };
}

/** The module instances a stand-alone reader uses (the guard's and this tool's): the bare src/ modules from `root`, and the staged armor line
    from this tool's own tree (a guard's planted copy carries src/, never tools/). */
export async function loadArmorPower(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const [{ ITEMS }, { MONSTERS, monsterLevelOf }, { HUNT_GROUNDS }, { HUNT_INDEX }, combat, mitigation, elements, spells, member, xp, line, core, { DANGER_GROUNDS }] = await Promise.all([
    import(u('src/data/items.js')), import(u('src/data/monsters.js')), import(u('src/data/hunt-grounds.js')), import(u('src/data/hunts.js')),
    import(u('src/core/combat.js')), import(u('src/core/mitigation.js')),
    import(u('src/core/elements.js')), import(u('src/data/monster-spells.js')), import(u('src/core/member.js')), import(u('src/core/xp.js')),
    import(new URL('./staged/armor-line.js', import.meta.url).href), import(u('src/data/core-model.js')), import(u('src/data/danger.js'))]);
  return { mods: { ITEMS, MONSTERS, monsterLevelOf, HUNT_GROUNDS, HUNT_INDEX, combat, mitigation, elements, spells,
    deriveProfile: member.deriveProfile, skillXpForLevel: xp.skillXpForLevel, line, capPm: core.ARMOUR_MITIGATION.capPm, DANGER_GROUNDS }, line };
}

if (isMain(import.meta.url)) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { mods, line } = await loadArmorPower(ROOT);
  const P = armorPower(mods);
  const G = P.lateGrounds();
  const f3 = (n) => (n == null ? '-' : n.toFixed(3));
  const S = line.LINE_SAMPLE;
  console.log('THE SAMPLE AGAINST THE LINE (pace / safety over the line\'s piece of its slot and weight at the piece\'s Level, the line worn elsewhere, a hero of the piece\'s Level or the ground\'s floor; the ceiling: their mean <= 1 and each <= ' + (1 + line.LINE_TRADE).toFixed(2) + ')');
  console.log('| Piece | Slot, weight, Level | ' + G.join(' | ') + ' |');
  console.log('|---|---|' + G.map(() => '---').join('|') + '|');
  for (const s of Object.values(S)) {
    const rows = P.againstLine(s.row, s.row.reqLv, G);
    console.log('| ' + s.row.n + ' | ' + s.row.slot + ', ' + s.row.armourClass + ', ' + s.row.reqLv + ' | ' + rows.map((r) => f3(r.pace) + ' / ' + f3(r.safety)).join(' | ') + ' |');
  }
  console.log('\nWHO WINS WHERE (at the piece\'s Level on the grounds that Level is sent to, worn in fully tempered Dawnsteel: the score over the tempered Dawnsteel piece of its slot, 1.000; - not sent there)');
  console.log('| Piece | ' + G.join(' | ') + ' |');
  console.log('|---|' + G.map(() => '---').join('|') + '|');
  for (const s of Object.values(S)) {
    const H = P.huntedAt(s.row.reqLv, G);
    console.log('| ' + s.row.n + ' | ' + G.map((g) => (H.includes(g) ? f3(P.scoreOnDawn(s.row, g, s.row.reqLv)) : '-')).join(' | ') + ' |');
  }
  console.log('\nTHE LINE\'S WHOLE SET OVER FULLY TEMPERED DAWNSTEEL, safety, a hero of the set\'s Level on each late ground; the first Level it clears 1 on every ground that Level is sent to (LINE_FIRST_LEVEL)');
  for (const w of ['plate', 'leather', 'cloth']) {
    const cells = [110, 115, 120, 125, 130, 145, 165].map((R) => R + ': ' + G.map((g) => f3(P.setVsTemperedDawn(w, R, g).safety)).join('/'));
    console.log('  ' + w + ' (first ' + P.firstLevel(w, G) + ', data ' + line.LINE_FIRST_LEVEL[w] + '): ' + cells.join('  '));
  }
}
