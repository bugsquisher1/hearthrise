// tools/balance-sim/weapon-power.mjs — A WEAPON'S POWER ON A GROUND, read off the engine's own rolls (designer, lane/d-weapon-line;
// the weapon line past Dawnsteel, src/data/weapon-line.js, PRIORITY_BOARD "2026-11-16 The weapon line past Dawnsteel").
//
// The weapon line is a budget: a unique worn from Level R may spend it any way it likes, as long as its power on every ground from
// the line's anchor up is at or under the line's weapon there. This is the one measure of that power, shared by the guard
// (tests/weapon-line.mjs) and the grader's `--uniques` pick (gear.mjs), so the two can't rank a weapon differently.
//
// POWER. A hero of Level L (every combat skill at L, the harness default) swings the weapon alone at each monster the ground
// spawns: src/core/combat.js playerCombatRolls gives the accuracy against that monster's defence, the max hit after its defence,
// the weakness and the bane, and the critical chance; a basic blow is a miss, or 1..maxHit, a critical one applyCrit's. The
// expected blow against monster m is E_m. The ground's power is its spawn's hit points over the time to clear it,
// sum(w x hp) / sum(w x hp / E_m), w the pack's spawn weight (HUNT_INDEX spawns): the blow a hero lands on the average head,
// weighted by how long each head takes. It reads the weapon alone (no armor, no off-hand, no ammo), so the number is the
// weapon's own. Spells and Melee moves aren't in it (a critical chance pays on basic blows only), so a keen piece reads a little
// over what it plays: the ceiling errs safe.
//
//   node tools/balance-sim/weapon-power.mjs     the sample against the line on every late ground, who wins where, and the Mage bar
//
// Pure reader: it changes no table. `weaponPower(mods)` takes the module instances it reads, so the grader passes the engine's own.
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';

/**
 * The power measure on the given module instances.
 * mods: { ITEMS, MONSTERS, HUNT_GROUNDS, HUNT_INDEX, combat (src/core/combat.js), deriveProfile, skillXpForLevel, line (src/data/weapon-line.js) }
 */
export function weaponPower(mods) {
  const { ITEMS, MONSTERS, HUNT_GROUNDS, HUNT_INDEX, combat, deriveProfile, skillXpForLevel, line } = mods;
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const skillsAt = (L) => ({ melee: skillXpForLevel('melee', L), ranged: skillXpForLevel('ranged', L), magic: skillXpForLevel('magic', L) });
  /** The expected basic blow of `row` (an item row, worn alone) on monster `m` by a hero of Level L, and the rolls behind it. */
  function blow(row, m, L) {
    const r = combat.playerCombatRolls(m, { items: { __weapon: row }, equipment: { weapon: '__weapon' }, skills: skillsAt(L), profile: deriveProfile(row.weaponType) });
    const M = Math.max(1, r.maxHit), c = r.critChance || 0;
    let s = 0;
    for (let d = 1; d <= M; d++) s += (1 - c) * d + c * combat.applyCrit(d);
    return { e: r.accuracy * s / M, acc: r.accuracy, maxHit: M, crit: c };
  }
  const spawnsOf = (gid) => {
    const g = HUNT_GROUNDS[gid], h = g && HUNT_INDEX[g.hunt];
    return (h && h.spawns || []).filter((s) => MONSTERS[s.monster] && s.w > 0);
  };
  /** The power of `row` on ground `gid` for a hero of Level L (null: the ground spawns nothing the table knows). */
  function groundPower(row, gid, L) {
    let hp = 0, t = 0;
    for (const s of spawnsOf(gid)) {
      const m = MONSTERS[s.monster], e = blow(row, m, L).e;
      hp += s.w * m.hp; t += s.w * m.hp / Math.max(1e-9, e);
    }
    return t > 0 ? hp / t : null;
  }
  /** Every ground the line answers to: its band starts at the line's anchor or later (open or staged), sorted by its floor. */
  function lateGrounds() {
    return Object.entries(HUNT_GROUNDS)
      .filter(([, g]) => g && own(HUNT_INDEX, g.hunt) && HUNT_INDEX[g.hunt].band && HUNT_INDEX[g.hunt].band[0] >= line.WEAPON_LINE_ANCHOR)
      .sort((a, b) => HUNT_INDEX[a[1].hunt].band[0] - HUNT_INDEX[b[1].hunt].band[0] || (a[0] < b[0] ? -1 : 1)).map(([gid]) => gid);
  }
  /** The line's weapon of `family` at Level L as a full row: its Dawnsteel base with the line's numbers. */
  function lineRow(family, L) {
    const b = line.WEAPON_LINE_BASE[family];
    if (!b || !ITEMS[b.id]) return null;
    return { ...ITEMS[b.id], ...line.lineWeapon(family, L), reqLv: Math.max(Number(ITEMS[b.id].reqLv) || 1, Number(L) || 1) };
  }
  /** `row` (of `family`) against the line on every late ground at Level L: [{ ground, power, line, ratio }]. */
  function againstLine(row, family, L, grounds = lateGrounds()) {
    const ln = lineRow(family, L);
    return grounds.map((g) => { const p = groundPower(row, g, L), l = ln ? groundPower(ln, g, L) : null; return { ground: g, power: p, line: l, ratio: p && l ? p / l : null }; });
  }
  return { blow, groundPower, lateGrounds, lineRow, againstLine, spawnsOf };
}

/** The module instances a stand-alone reader uses (the guard's and this tool's): the bare src/ modules. */
export async function loadWeaponPower(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const [{ ITEMS }, { MONSTERS }, { HUNT_GROUNDS }, { HUNT_INDEX }, combat, member, xp, line] = await Promise.all([
    import(u('src/data/items.js')), import(u('src/data/monsters.js')), import(u('src/data/hunt-grounds.js')), import(u('src/data/hunts.js')),
    import(u('src/core/combat.js')), import(u('src/core/member.js')), import(u('src/core/xp.js')), import(u('src/data/weapon-line.js'))]);
  return { mods: { ITEMS, MONSTERS, HUNT_GROUNDS, HUNT_INDEX, combat, deriveProfile: member.deriveProfile, skillXpForLevel: xp.skillXpForLevel, line }, line };
}

if (isMain(import.meta.url)) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { mods, line } = await loadWeaponPower(ROOT);
  const P = weaponPower(mods);
  const G = P.lateGrounds();
  const f3 = (n) => (n == null ? '-' : n.toFixed(3));
  console.log('THE SAMPLE AGAINST THE LINE (power / the line\'s, each late ground at the piece\'s own Level; the ceiling is 1.000)');
  console.log('| Piece | Level | ' + G.join(' | ') + ' | Dawnsteel on the same grounds |');
  for (const [id, s] of Object.entries(line.WEAPON_SAMPLE)) {
    const L = s.row.reqLv, rows = P.againstLine(s.row, s.family, L, G), base = mods.ITEMS[line.WEAPON_LINE_BASE[s.family].id];
    const dawn = P.againstLine(base, s.family, L, G);
    console.log('| ' + s.row.n + ' | ' + L + ' | ' + rows.map((r) => f3(r.ratio)).join(' | ') + ' | ' + dawn.map((r) => f3(r.ratio)).join(' / ') + ' |');
  }
  console.log('\nWHO WINS WHERE (same family, at the higher Level; power on each ground, the winner starred)');
  const ids = Object.keys(line.WEAPON_SAMPLE);
  for (const fam of new Set(ids.map((id) => line.WEAPON_SAMPLE[id].family))) {
    const mine = ids.filter((id) => line.WEAPON_SAMPLE[id].family === fam);
    const L = Math.max(...mine.map((id) => line.WEAPON_SAMPLE[id].row.reqLv));
    const can = mine.filter((id) => line.WEAPON_SAMPLE[id].row.reqLv <= L);
    for (const g of G) {
      const ps = can.map((id) => [id, P.groundPower(line.WEAPON_SAMPLE[id].row, g, L)]).sort((a, b) => b[1] - a[1]);
      console.log('  ' + fam + ' @' + L + ' ' + g + ': ' + ps.map(([id, p], i) => (i === 0 ? '*' : '') + id + ' ' + p.toFixed(1)).join(', '));
    }
    const M = Object.fromEntries(P.spawnsOf('pauper_vaults').map((s) => [s.monster, can.map((id) => [id, P.blow(line.WEAPON_SAMPLE[id].row, mods.MONSTERS[s.monster], L).e]).sort((a, b) => b[1] - a[1])[0][0]]));
    if (can.length > 1) console.log('  ' + fam + ' @' + L + ' best blow by monster at the Vaults: ' + JSON.stringify(M));
  }
}
