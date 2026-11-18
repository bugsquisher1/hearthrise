// tools/balance-sim/weapon-power.mjs — A WEAPON'S POWER ON A GROUND, read off the engine's own rolls (designer, lane/d-weapon-line;
// the weapon line past Dawnsteel, tools/balance-sim/staged/weapon-line.js, PRIORITY_BOARD "2026-11-16 The weapon line past Dawnsteel").
//
// The weapon line is a budget: a unique worn from Level R may spend it any way it likes, as long as its power on every ground from
// the line's anchor up is at or under the line's weapon there. This is the one measure of that power, shared by the guard
// (tests/weapon-line.mjs) and the grader's `--uniques` pick (gear.mjs), so the two can't rank a weapon differently.
//
// POWER. A hero of Level L (every combat skill at L, the harness default) swings the weapon alone at each monster the ground
// spawns: src/core/combat.js playerCombatRolls gives the accuracy against that monster's defence, the max hit after its defence,
// the weakness and the bane, and the critical chance; a basic blow is a miss, or 1..maxHit, a critical one applyCrit's. The
// expected blow against monster m is E_m. A ground reads two ways, each a weighted harmonic mean of E_m over its spawn (w the pack's
// spawn weight, HUNT_INDEX spawns):
//   PACE    sum(w x hp) / sum(w x hp / E_m): the blow a hero lands on the average head, weighted by how long each head takes
//           (kills an hour, so XP and coin);
//   SAFETY  the same, each head weighted again by what it does to the hero while it lives (its threat: the engine's
//           monsterCombatRolls accuracy against a hero of Level L with no guard, times its average blow, over its swing time):
//           the blow a hero lands weighted by the damage it takes meanwhile (the low point and the food bill).
// Measured on the real settle (lane/d-weapon-line, the Pauper Vaults at 165, lone axes, 6 x 4 h, the same dice): a bane of the
// Undead read 0.98 of the line's PACE and killed 223 an hour against the line's 226, but its low point was 59.9 against 62.1,
// because the heads it doesn't bite (the Leech, the Night Carter) hit hardest. So the ceiling holds on both, and a piece ranks
// by their mean (`score`). It reads the weapon alone (no armor, no off-hand, no ammo), so the number is the weapon's own. Melee
// moves are 5-18% of a Melee hero's damage and read the max hit only (no accuracy, crit or bane), so a keen or bane piece reads a
// little over what it plays: the ceiling errs safe.
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
 * mods: { ITEMS, MONSTERS, HUNT_GROUNDS, HUNT_INDEX, combat (src/core/combat.js), deriveProfile, skillXpForLevel, line (tools/balance-sim/staged/weapon-line.js) }
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
  /** What monster m does to a hero of Level L with no guard, a millisecond: its chance to land, its average blow, over its swing. */
  function threat(m, L) {
    const r = combat.monsterCombatRolls(m, { eq: {}, skills: skillsAt(L) });
    return r.accuracy * (Math.max(1, r.maxHit) + 1) / 2 / Math.max(1, Number(m.speed) || 2000);
  }
  /** The PACE power of `row` on ground `gid` for a hero of Level L (null: the ground spawns nothing the table knows). */
  function groundPower(row, gid, L, safety = false) {
    let hp = 0, t = 0;
    for (const s of spawnsOf(gid)) {
      const m = MONSTERS[s.monster], e = blow(row, m, L).e, k = s.w * m.hp * (safety ? threat(m, L) : 1);
      hp += k; t += k / Math.max(1e-9, e);
    }
    return t > 0 ? hp / t : null;
  }
  /** The SAFETY power: as the pace, each head weighted again by its threat. */
  const safePower = (row, gid, L) => groundPower(row, gid, L, true);
  /** The rank of a weapon on a ground: the mean of its pace and its safety. */
  const score = (row, gid, L) => { const a = groundPower(row, gid, L), b = safePower(row, gid, L); return a === null || b === null ? null : (a + b) / 2; };
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
  /** `row` (of `family`) against the line on every late ground at Level L: [{ ground, pace, safety (each over the line's), ratio (the larger) }]. */
  function againstLine(row, family, L, grounds = lateGrounds()) {
    const ln = lineRow(family, L);
    return grounds.map((g) => {
      const p = groundPower(row, g, L), lp = ln ? groundPower(ln, g, L) : null, s = safePower(row, g, L), ls = ln ? safePower(ln, g, L) : null;
      const pace = p && lp ? p / lp : null, safety = s && ls ? s / ls : null;
      return { ground: g, power: p, line: lp, pace, safety, ratio: pace === null || safety === null ? null : Math.max(pace, safety) };
    });
  }
  return { blow, threat, groundPower, safePower, score, lateGrounds, lineRow, againstLine, spawnsOf };
}

/** The module instances a stand-alone reader uses (the guard's and this tool's): the bare src/ modules. */
export async function loadWeaponPower(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const [{ ITEMS }, { MONSTERS }, { HUNT_GROUNDS }, { HUNT_INDEX }, combat, member, xp, line] = await Promise.all([
    import(u('src/data/items.js')), import(u('src/data/monsters.js')), import(u('src/data/hunt-grounds.js')), import(u('src/data/hunts.js')),
    import(u('src/core/combat.js')), import(u('src/core/member.js')), import(u('src/core/xp.js')), import(u('tools/balance-sim/staged/weapon-line.js'))]);
  return { mods: { ITEMS, MONSTERS, HUNT_GROUNDS, HUNT_INDEX, combat, deriveProfile: member.deriveProfile, skillXpForLevel: xp.skillXpForLevel, line }, line };
}

if (isMain(import.meta.url)) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { mods, line } = await loadWeaponPower(ROOT);
  const P = weaponPower(mods);
  const G = P.lateGrounds();
  const f3 = (n) => (n == null ? '-' : n.toFixed(3));
  const S = line.WEAPON_SAMPLE, TD = line.TEMPERED_DAWNSTEEL;
  console.log('THE SAMPLE AGAINST THE LINE (pace / safety over the line\'s, each late ground at the piece\'s own Level; the ceiling is 1.000 on both)');
  console.log('| Piece | Level | ' + G.join(' | ') + ' | Dawnsteel tempered (x' + TD + '), the same way |');
  for (const [, s] of Object.entries(S)) {
    const L = s.row.reqLv, rows = P.againstLine(s.row, s.family, L, G), base = mods.ITEMS[line.WEAPON_LINE_BASE[s.family].id];
    const dawn = P.againstLine(base, s.family, L, G);
    console.log('| ' + s.row.n + ' | ' + L + ' | ' + rows.map((r) => f3(r.pace) + ' / ' + f3(r.safety)).join(' | ') + ' | ' + dawn.map((r) => f3(r.pace * TD) + ' / ' + f3(r.safety * TD)).join(', ') + ' |');
  }
  console.log('\nWHO WINS WHERE (same family, at each piece\'s Level; the score is the mean of pace and safety; tempered Dawnsteel beside them)');
  const ids = Object.keys(S);
  for (const L of [...new Set(ids.map((id) => S[id].row.reqLv))].sort((a, b) => a - b)) for (const fam of new Set(ids.map((id) => S[id].family))) {
    const can = ids.filter((id) => S[id].family === fam && S[id].row.reqLv <= L);
    if (!can.some((id) => S[id].row.reqLv === L)) continue;
    const base = mods.ITEMS[line.WEAPON_LINE_BASE[fam].id];
    for (const g of G) {
      const ps = can.map((id) => [id, P.score(S[id].row, g, L)]).concat([['tempered ' + base.n, P.score(base, g, L) * TD]]).sort((a, b) => b[1] - a[1]);
      console.log('  ' + fam + ' @' + L + ' ' + g + ': ' + ps.map(([id, p], i) => (i === 0 ? '*' : '') + id + ' ' + p.toFixed(1)).join(', '));
    }
    if (can.length > 1) {
      const M = Object.fromEntries(P.spawnsOf('pauper_vaults').map((s) => [s.monster, can.map((id) => [id, P.blow(S[id].row, mods.MONSTERS[s.monster], L).e]).sort((a, b) => b[1] - a[1])[0][0]]));
      console.log('  ' + fam + ' @' + L + ' best blow by monster at the Vaults: ' + JSON.stringify(M));
    }
  }
  /* THE LINE'S FIRST LEVEL (lane/d-temper-dawnsteel: tier 7 tempers to +2%): the lowest Level where the line's weapon beats fully tempered
     Dawnsteel on every late ground, both ways, so a unique worn from there can be an upgrade */
  console.log('\nTHE FIRST LEVEL THE LINE BEATS TEMPERED DAWNSTEEL (x' + TD + ') on every late ground, pace and safety');
  for (const fam of Object.keys(line.WEAPON_LINE_BASE)) {
    const base = mods.ITEMS[line.WEAPON_LINE_BASE[fam].id];
    let first = null;
    for (let L = line.WEAPON_LINE_ANCHOR; L <= 200 && first === null; L++) {
      if (P.againstLine(base, fam, L, G).every((r) => r.pace * TD < 1 && r.safety * TD < 1)) first = L;
    }
    console.log('  ' + fam + ': ' + first);
  }
  /* the Mage bar (tests/weapon-line.mjs WL9, style-gear SG-8's 1.3): max hit on a zero-defence foe, Magic and Melee at the Level */
  console.log('\nTHE MAGE ON THE LINE (wand on the line, Duskwood Codex, full Duskweave) OVER A WARHAMMER ON THE LINE, max hit, the bar 1.3');
  const robes = ['duskweave_helmet', 'duskweave_body', 'duskweave_pants', 'duskweave_boots', 'duskweave_gloves', 'duskweave_belt'];
  for (const L of [88, 110, 125, 145, 165, 185, 200]) {
    const items = { ...mods.ITEMS, __wand: P.lineRow('wand', L), __hammer: P.lineRow('warhammer', L) };
    const mh = (eq) => mods.combat.playerCombatRolls({ def: 0, tier: 1 }, { items, equipment: eq, skills: { melee: mods.skillXpForLevel('melee', L), magic: mods.skillXpForLevel('magic', L) },
      profile: mods.deriveProfile(items[eq.weapon].weaponType) }).maxHit;
    const m = mh({ weapon: '__wand', shield: 'duskwood_codex', ...Object.fromEntries(robes.map((d) => [mods.ITEMS[d].slot, d])) }), h = mh({ weapon: '__hammer' });
    console.log('  Level ' + L + ': Mage ' + m + ', warhammer ' + h + ', ' + (m / h).toFixed(2));
  }
}
