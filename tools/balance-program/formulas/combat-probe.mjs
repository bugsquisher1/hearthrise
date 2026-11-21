#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/formulas/combat-probe.mjs — READ-ONLY: the combat formulas read at Level 1 to 5,000 (balance program
// 40-formula-brief.md §7; the numbers behind docs/design/balance-program/41-formulas-combat.md section 7).
//
//   node tools/balance-program/formulas/combat-probe.mjs            the tables
//   node tools/balance-program/formulas/combat-probe.mjs --json     the same rows as JSON
//
// WHAT IT IS, AND IS NOT. Every number is the game's OWN function, called directly: src/core/combat.js (playerCombatRolls,
// monsterMaxHit, monsterAccuracy, defenceReduction), src/core/mitigation.js (mitigationOf, mitigate), src/core/vitals.js (maxHpFor),
// src/data/balance-sheet.js (formulaStats, tierRowFor), src/data/to-hit.js (refHeroAt), src/data/abilities.js (castAmount, hitRange),
// src/data/statuses.js. It is NOT a hunt: no pull, no walk, no bar, no party. It answers "what does each formula return at this Level",
// one blow at a time, which is what a scaling audit needs; hunt outcomes are tools/balance-program/progression-grid.mjs's (the real settle).
//
// THE HERO IT READS. Skills: the reference hero (to-hit.js REF_HERO, the measured lone hammer; past Level 1,000 its own straight
// extrapolation). Gear, two ways, because the game has no item past tier 7 (Level 90) today:
//   FROZEN   tier-7 (Dawnsteel) plate and the Dawnsteel warhammer, worn forever: the game as it is built.
//   LINE     the staged lines' formula (tools/balance-sim/staged/armor-line.js lineArmor, weapon-line.js lineWeapon: Dawnsteel x Level / 110):
//            PROJECTED, not in the game.
// The monster: a `regular` of the hero's own Level on a full ground (floor = Level), fit `both`, the formula's row.
// Changes nothing, writes nothing. PURE but for the imports.
// ════════════════════════════════════════════════════════════════════════
import { playerCombatRolls, monsterMaxHit, monsterAccuracy, defenceReduction, COMBAT_BALANCE } from '../../../src/core/combat.js';
import { mitigationOf, mitigate } from '../../../src/core/mitigation.js';
import { maxHpFor } from '../../../src/core/vitals.js';
import { formulaStats, tierRowFor, STAT_FORMULA } from '../../../src/data/balance-sheet.js';
import { refHeroAt, TO_HIT } from '../../../src/data/to-hit.js';
import { ABILITIES, castAmount, hitRange } from '../../../src/data/abilities.js';
import { STATUSES } from '../../../src/data/statuses.js';
import { TOWER_RULES } from '../../../src/data/tower.js';
import { LINE_BASE, lineArmor } from '../../balance-sim/staged/armor-line.js';
import { WEAPON_LINE_BASE, lineWeapon } from '../../balance-sim/staged/weapon-line.js';

const LEVELS = [1, 10, 30, 60, 110, 185, 400, 1000, 2000, 5000];
const SLOTS = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'];
/* xp for a skill level is never read here: playerCombatRolls takes skills as XP, so the probe hands it a levelOf-free context instead:
   a one-item catalogue whose `meleePlus` carries the whole skill (the engine adds worn +skill to the level, combat.js skillPlusOf). */
function heroAt(L, mode) {
  const ref = refHeroAt(L);
  const scaleLv = mode === 'line' ? Math.max(110, L) : 110;
  const w = lineWeapon('warhammer', scaleLv) || WEAPON_LINE_BASE.warhammer;
  const items = { w: { slot: 'weapon', weaponType: 'club', atkB: w.atkB || 0, strB: w.strB || 0, meleePlus: Math.max(0, Math.round(ref.main) - 1) } };
  const equipment = { weapon: 'w' };
  let heavy = 0;
  for (const s of SLOTS) { const d = lineArmor(s, 'plate', scaleLv); items[s] = { slot: s, armourClass: 'plate', defB: d }; equipment[s] = s; heavy += d; }
  /* under Level 90 a hero wears less than Dawnsteel: scale both by Level / 90 so the early rows are not a twinked hero (a straight read
     of the tier tables' own climb, gear-tiers.js; labelled, never a claim about a real kit) */
  if (L < 90) {
    const k = Math.max(0.05, L / 90);
    items.w.atkB = Math.round(items.w.atkB * k); items.w.strB = Math.round(items.w.strB * k);
    heavy = 0;
    for (const s of SLOTS) { items[s].defB = Math.max(1, Math.round(items[s].defB * k)); heavy += items[s].defB; }
  }
  const rolls = (mon) => playerCombatRolls(mon, { equipment, items, skills: {} });
  return { ref, items, equipment, armour: { heavy, medium: 0, light: 0 }, maxHp: maxHpFor(L, 6), rolls, defense: Math.round(ref.defense) };
}

function rowAt(L) {
  const hot = {};
  const mon = (role, tier = 1) => { const s = formulaStats({ level: L, role, tier, floor: L, fit: 'both' }); return { ...s, tier, level: L }; };
  const reg = mon('regular'), elite = mon('elite');
  const out = { L, monster: { hp: reg.hp, atk: reg.atk, def: reg.def, aim: reg.aim, evasion: reg.evasion, maxHit: monsterMaxHit(reg) } };
  for (const mode of ['frozen', 'line']) {
    const h = heroAt(L, mode);
    const free = h.rolls(null), vs = h.rolls(reg);
    const M = free.maxHit;                       // the unit's snapshot maxHit: what every spell is a share of
    const meanBlow = Math.max(1, (M + 1) / 2 - defenceReduction(reg));
    const perSwing = vs.accuracy * meanBlow;
    const monHit = monsterAccuracy(reg, h.defense);
    const mit = mitigationOf(h.armour, L);
    const top = monsterMaxHit(reg);
    const landed = mitigate(top, 1000, mit, 0, null);
    const meanIn = monHit * mitigate(Math.round((top + 1) / 2), 1000, mit, 0, null);
    const deadly = tierRowFor(L, 'deadly', {});
    const mend = castAmount(ABILITIES.mend, M, h.maxHp, 1000).heal;
    const gm = ABILITIES.greater_mend ? castAmount(ABILITIES.greater_mend, M, h.maxHp, 1400).heal : null;
    const ps = hitRange(M, ABILITIES.power_strike);
    const bleedScale = Math.max(1400, Math.floor((M * STATUSES.bleed.blowPm * 1400) / 1000));
    out[mode] = {
      skill: Math.round(h.ref.main), maxHit: M, skillShareOfMaxHit: +(0.35 * h.ref.main / M).toFixed(2),
      heroHit: +vs.accuracy.toFixed(3), swingsToKill: +(reg.hp / perSwing).toFixed(1), swingsToKillElite: +(elite.hp / (h.rolls(elite).accuracy * Math.max(1, (M + 1) / 2 - defenceReduction(elite)))).toFixed(1),
      maxHp: h.maxHp, monHit: +monHit.toFixed(3), absorbPm: mit.absorbPm, topBlowPctHp: +(100 * landed / h.maxHp).toFixed(1),
      /* one regular's mean damage a second into the hero, percent of max HP; x8 is Deadly's full box before its dmgPm */
      inPctHpPerS: +(100 * meanIn / (COMBAT_BALANCE.tickMs / 1000) / h.maxHp).toFixed(2),
      deadlyBoxPctHpPerS: +(100 * 8 * meanIn * (deadly.dmgPm / 1000) / (COMBAT_BALANCE.tickMs / 1000) / h.maxHp).toFixed(1),
      mendPctHp: +(100 * mend / h.maxHp).toFixed(1), greaterMendVpctHp: gm === null ? null : +(100 * gm / h.maxHp).toFixed(1),
      powerStrike: ps, defCutPctOfMeanBlow: +(100 * defenceReduction(elite) / ((M + 1) / 2)).toFixed(1),
      bleed5StacksPctMonHpPerS: +(100 * 5 * 2 * bleedScale / 1000 / reg.hp).toFixed(1),
    };
  }
  /* the Tower's heat at room L (tower.js heatOpts: compounding past heat.from, read to floorTop) */
  const F = Math.min(L, TOWER_RULES.floorTop), h = TOWER_RULES.heat;
  out.towerHeat = +(F > h.from ? (1 + h.perFloorPm / 1000) ** (F - h.from) : 1).toFixed(2);
  return out;
}

const rows = LEVELS.map(rowAt);
if (process.argv.includes('--json')) { console.log(JSON.stringify({ toHitBase: TO_HIT.base, blow: STAT_FORMULA.blow, rows }, null, 1)); process.exit(0); }
const pad = (v, n) => String(v).padStart(n);
console.log('THE MONSTER (a regular of Level L on a full ground, the formula\'s row)');
console.log('     L      hp    atk  maxHit    def    aim  evasion  towerHeat');
for (const r of rows) console.log(pad(r.L, 6) + pad(r.monster.hp, 8) + pad(r.monster.atk, 7) + pad(r.monster.maxHit, 8) + pad(r.monster.def, 7) + pad(r.monster.aim, 7) + pad(r.monster.evasion, 9) + pad(r.towerHeat, 11));
for (const mode of ['frozen', 'line']) {
  console.log('\nTHE HERO, ' + (mode === 'frozen' ? 'FROZEN on tier 7 (the game as built)' : 'ON THE LINE (PROJECTED: Dawnsteel x Level / 110)'));
  console.log('     L  skill  maxHit  skill%  heroHit  swings  (elite)   maxHp  monHit  absorb  topBlow%  in%/s  deadly8%/s  mend%  gMendV%  defCut%  bleed%/s');
  for (const r of rows) {
    const m = r[mode];
    console.log(pad(r.L, 6) + pad(m.skill, 7) + pad(m.maxHit, 8) + pad(m.skillShareOfMaxHit, 8) + pad(m.heroHit, 9) + pad(m.swingsToKill, 8) + pad(m.swingsToKillElite, 9) + pad(m.maxHp, 8) + pad(m.monHit, 8)
      + pad(m.absorbPm, 8) + pad(m.topBlowPctHp, 10) + pad(m.inPctHpPerS, 7) + pad(m.deadlyBoxPctHpPerS, 12) + pad(m.mendPctHp, 7) + pad(m.greaterMendVpctHp, 9) + pad(m.defCutPctOfMeanBlow, 9) + pad(m.bleed5StacksPctMonHpPerS, 10));
  }
}
