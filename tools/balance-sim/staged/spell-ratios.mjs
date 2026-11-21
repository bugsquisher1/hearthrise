#!/usr/bin/env node
// tools/balance-sim/staged/spell-ratios.mjs — WHAT A CAST IS WORTH AGAINST THE MONSTER OF ITS LEVEL, LEVEL 10 TO 400
// (designer, lane/d-balance-combat, 2026-11-20; the combat dive of the balance program, docs/design/balance-program/21-combat.md).
// NO PLAY: the game's own rows and functions read at seven Levels. It grades nothing and writes nothing.
//
//   node tools/balance-sim/staged/spell-ratios.mjs
//
// For every ability that lands a number: the version a career caster holds (I-V at 1 / 15 / 30 / 45 / 60 in the row's skill), what
// one cast lands on a same-Level regular of a full ground UNDER THE SPELL RULE (lane/c-spell-rule, 2026-11-21: src/data/abilities.js
// castAmount, a share of the caster's own largest blow, its unit's maxHit against a zero-defence foe; src/core/hunt/damage.js hurt takes
// the monster's defence once, THEN the version's step), as a share of that monster's HP, beside the hero's own basic blow; and for a heal
// or a shell, as a share of the caster's HP and of the monster's largest blow. The skill is the measured career line of the way that
// casts it (skill-lines.json), projected past Level 100 on the skill curve's own cost (the projection of `measure.mjs curves`).
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadGear } from '../gear.mjs';
import { loadLines, skillsAt } from '../skill-lines.mjs';
import { sourceQuery } from '../../lib/version-stamp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const v = sourceQuery(ROOT);
const BS = await import(u('src/data/balance-sheet.js') + v);
const C = await import(u('src/core/combat.js') + v);
const XP = await import(u('src/core/xp.js') + v);
const A = await import(u('src/data/abilities.js') + v);
const { LEVEL_PACE } = await import(u('src/data/core-model.js') + v);
const MEM = await import(u('src/core/member.js') + v);
const gear = await loadGear(ROOT);
const lines = loadLines();
const top = lines.top;
const LEVELS = [10, 30, 60, 110, 165, 240, 400];
const tierAt = (L) => (L < 15 ? 1 : L < 30 ? 2 : L < 45 ? 3 : L < 60 ? 4 : L < 75 ? 5 : 6);
const hoursAt = (L) => { const t = LEVEL_PACE.targets; for (let i = 1; i < t.length; i++) if (L <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (L - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); return t[t.length - 1][1]; };
const project = (way, k, L) => {
  const at = (x) => skillsAt(lines, 'alone', way, Math.min(x, top))[k];
  if (L <= top) return at(L);
  const s1 = at(top), s0 = at(top - 10);
  const rate = (XP.skillXpForLevel(k, s1) - XP.skillXpForLevel(k, s0)) / (hoursAt(top) - hoursAt(top - 10));
  return XP.skillLevelFromXp(k, XP.skillXpForLevel(k, s1) + rate * (hoursAt(L) - hoursAt(top)) * Math.sqrt(L / top));
};
/* the way that casts a discipline's rows, and the skill its versions read */
const WAY = { shield: 'tank', sword: 'sword', dual_axe: 'axes', club: 'hammer', ranged: 'bow', destruction: 'mage', restoration: 'healer' };
const MAIN = { tank: 'melee', sword: 'melee', axes: 'melee', hammer: 'melee', bow: 'ranged', mage: 'magic', healer: 'magic' };
const verAt = (lv) => (lv >= 60 ? 5 : lv >= 45 ? 4 : lv >= 30 ? 3 : lv >= 15 ? 2 : 1);
const mid = (r) => (r[0] + r[1]) / 2;
const pct = (x) => (x * 100).toFixed(0) + '%';

console.log('SPELL RATIOS (no play). A same-Level regular on a full ground; the caster on its career line (projected past 100). One cast, rune of its own version (a store rune lands 75% of it).');
console.log('MONSTER AND HERO: Level | monster HP | monster blow (max) | hero HP | defence reduction a hit');
const MON = {};
for (const L of LEVELS) {
  const tier = tierAt(L);
  const f = BS.formulaStats({ level: L, role: 'regular', tier, floor: Math.max(16, L - 8), fit: 'both' });
  const mon = { atk: f.atk, def: f.def, hp: f.hp, baseAcc: f.baseAcc, tier, level: L };
  MON[L] = { mon, f, red: C.defenceReduction(mon), blow: C.monsterMaxHit(mon), hp: BS.STAT_FORMULA.refHp(L) };
  console.log([L, f.hp, MON[L].blow, MON[L].hp, MON[L].red].join(' | '));
}
console.log('\nBASIC BLOW: way | ' + LEVELS.map((L) => 'L' + L + ' skill, max hit, average landed share of monster HP').join(' | '));
const BASIC = {};
for (const way of ['hammer', 'sword', 'tank', 'axes', 'bow', 'mage', 'healer']) {
  const cells = LEVELS.map((L) => {
    let kit; try { kit = gear.kitOf(way, Math.min(L, 110), { uniques: true }); } catch { kit = gear.kitOf(way, Math.min(L, 110), {}); }
    const eq = C.equipmentStats(kit.equipment || kit, gear.ITEMS);
    const sk = project(way, MAIN[way], L);
    const profile = MEM.deriveProfile ? MEM.deriveProfile(eq.weaponType) : undefined;
    let r;
    const ctx = { equipment: kit.equipment || kit, items: gear.ITEMS, eq, skills: { [MAIN[way]]: XP.skillXpForLevel(MAIN[way], sk) }, ...(kit.profile ? { profile: kit.profile } : profile ? { profile } : {}) };
    /* the unit's own maxHit is against a zero-defence foe (member.js heroSnapshot), the to-hit against this monster */
    try { r = C.playerCombatRolls(MON[L].mon, ctx); r = { ...r, maxHit: C.playerCombatRolls({}, ctx).maxHit }; } catch { r = null; }
    (BASIC[way] = BASIC[way] || {})[L] = r;
    return r ? sk + ', ' + r.maxHit + ', ' + pct(r.accuracy * (r.maxHit + 1) / 2 / MON[L].f.hp) : 'n/a';
  });
  console.log([way, ...cells].join(' | '));
}
console.log('\nDAMAGE CASTS: ability (discipline, cooldown s, target) | ' + LEVELS.map((L) => 'L' + L + ': skill -> version, mana, lands (average), share of monster HP').join(' | '));
console.log('HEALS AND SHELLS: the same, as share of the caster\'s own HP / of one monster blow');
for (const row of Object.values(A.ABILITIES)) {
  const d = (row.disciplines || [])[0];
  const way = WAY[d] || (row.skill === 'magic' ? 'mage' : 'hammer');
  const skill = row.skill || A.DISCIPLINE_SKILL[d] || 'melee';
  const isDmg = A.landsBlow(row);
  if (!isDmg && !A.heals(row) && !A.shells(row)) continue;
  const cells = LEVELS.map((L) => {
    const lv = project(way, skill, L), n = row.versions ? verAt(lv) : 1;
    const ver = A.versionOf(row, n), pm = ver.outPm;
    const M = MON[L], b = BASIC[way] && BASIC[way][L];
    if (!b) return 'n/a';
    const a = A.castAmount(row, b.maxHit, M.hp, pm);
    if (isDmg) {
      const lands = Math.max(1, mid(a.hit) - M.red) * pm / 1000 * (row.hits || 1);
      return lv + ' -> ' + 'I II III IV V'.split(' ')[n - 1] + ', ' + ver.mana + ', ' + lands.toFixed(0) + ', ' + pct(lands / M.f.hp);
    }
    const amt = a.heal || a.shield;
    return lv + ' -> ' + 'I II III IV V'.split(' ')[n - 1] + ', ' + ver.mana + ', ' + amt.toFixed(0) + ', ' + pct(amt / M.hp) + ' / ' + pct(amt / M.blow);
  });
  console.log([row.n + ' (' + (d || 'any') + ', ' + row.cdMs / 1000 + ', ' + row.target + ', ' + (row.hitPm || row.healPm || row.shieldPm || row.healHpPm) / 10 + '% of own ' + (row.healHpPm ? 'max HP' : 'blow') + ')', ...cells].join(' | '));
}
