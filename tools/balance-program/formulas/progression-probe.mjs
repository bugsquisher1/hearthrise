#!/usr/bin/env node
// tools/balance-program/formulas/progression-probe.mjs — READ-ONLY probe for the formula audit (42-formulas-progression.md).
// Reads the game's own curves (src/core, src/data) and prints what they do from Level 1 to 5,000. Changes nothing.
//   node tools/balance-program/formulas/progression-probe.mjs            every table
//   node tools/balance-program/formulas/progression-probe.mjs --json     the same numbers as JSON on stdout
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const XP = await imp('src/core/xp.js');
const CM = await imp('src/data/core-model.js');
const V = await imp('src/core/vitals.js');
const BS = await imp('src/data/balance-sheet.js');
const TH = await imp('src/data/to-hit.js');
const AR = await imp('src/core/action-rules.js');
const BL = await imp('src/data/blessings.js');
const TR = await imp('src/data/training.js');
const TP = await imp('src/data/temper.js');
const PX = await imp('src/data/party-class-xp.js');
const CB = await imp('src/core/combat.js');
const GT = await imp('src/data/gear-tiers.js');
const WL = await imp('tools/balance-sim/staged/weapon-line.js');
const JSON_OUT = process.argv.includes('--json');
const out = {};
const LEVELS = [1, 5, 10, 25, 50, 100, 200, 300, 400, 500, 750, 1000, 2000, 5000];
const fmt = (n) => (Math.abs(n) >= 1e15 ? n.toExponential(3) : Math.round(n).toLocaleString('en-US'));
const r1 = (n) => Math.round(n * 10) / 10, r2 = (n) => Math.round(n * 100) / 100;

/* 1. THE LEVEL CURVE: step, total, hours on the pace contract (a x L^b Level XP an hour at the hero's own Level, summed Level by Level) */
const contract = BS.contractXpPerH;
const step = (L) => XP.charXpForLevel(L + 1) - XP.charXpForLevel(L);
let hours = 0; const hoursAt = { 1: 0 };
for (let L = 1; L < 5000; L++) { hours += step(L) / contract(L); hoursAt[L + 1] = hours; }
const targets = Object.fromEntries(CM.LEVEL_PACE.targets);
out.level = LEVELS.map((L) => ({ L, step: step(L), total: XP.charXpForLevel(L), contractXpH: Math.round(contract(L)), hoursToReach: r1(hoursAt[L]), hoursThisLevel: r2(step(L) / contract(L)),
  daysAt12h: r1(hoursAt[L] / 12), target: targets[L] || null, vsTarget: targets[L] ? r2(hoursAt[L] / targets[L]) : null }));
/* hand-cut rows: the ratio of each step to the one before, and of each Level's contract hours to the one before */
out.levelSeams = [];
for (let L = 2; L <= 320; L++) {
  const a = step(L - 1), b = step(L), ha = a / contract(L - 1), hb = b / contract(L);
  if (b / a > 1.5 || hb / ha > 1.6 || hb / ha < 0.9) out.levelSeams.push({ L, stepBefore: a, step: b, stepRatio: r2(b / a), hoursRatio: r2(hb / ha) });
}
out.levelRows = XP.levelCurveRows().map((r) => ({ ...r }));
/* the last Level whose total is an exact integer (2^53) */
{ let lo = 1, hi = 1e7; while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (XP.charXpForLevel(m) <= Number.MAX_SAFE_INTEGER) lo = m; else hi = m; } out.levelExactTo = lo; }
out.levelTail = [400, 1000, 2000, 5000].map((L) => ({ L, hoursALevel: r1(step(L) / contract(L)), daysALevelAt12h: r2(step(L) / contract(L) / 12) }));

/* 2. THE COMBAT SKILL CURVE: XP a level, total, the yard's hours a level (30,000 an hour) */
const sx = (s) => XP.skillXpForLevel('melee', s);
out.skill = [10, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500, 700].map((s) => ({ s, step: sx(s + 1) - sx(s), total: sx(s), yardHoursThisLevel: r1((sx(s + 1) - sx(s)) / TR.TRAINING_RULES.xpPerHour),
  yardHoursTotal: r1(sx(s) / TR.TRAINING_RULES.xpPerHour), yardFeeAnHour: TR.trainingFee(s) }));
{ let s = 1; while (s < 5000 && sx(s + 1) > sx(s)) s++; out.skillCeiling = { lastReachableLevel: s, totalXp: sx(s) }; }
/* the skill a career hero holds at Level L IF the pace contract holds: Melee XP an hour = 1.5 x damage an hour = 1.5 x contract / (XP a HP point) */
const xpPerHp = (L) => Math.max(BS.STAT_FORMULA.xp.min, BS.STAT_FORMULA.xp.a * L ** BS.STAT_FORMULA.xp.b);
let skillXp = 0; const skillAt = {};
for (let L = 1; L <= 5000; L++) { skillAt[L] = XP.skillLevelFromXp('melee', skillXp); if (L < 5000) skillXp += (step(L) / contract(L)) * CM.COMBAT_XP.hitXpPerDamage * (contract(L) / xpPerHp(L)); }
out.careerSkill = LEVELS.map((L) => ({ L, bestCaseMelee: skillAt[L], refHeroMain: Math.round(TH.refHeroAt(L).main), refHeroDefense: Math.round(TH.refHeroAt(L).defense) }));

/* 3. HP AND MANA, AND WHAT STANDS AGAINST THEM (a full-ground regular of the same Level, the formula's row) */
const hammer = GT.WEAPON_FAMILIES.find((f) => f.key === 'warhammer');
const strTop = hammer.str[6];
out.vitals = LEVELS.map((L) => {
  const hp = V.maxHpFor(L, 0), hpPlate = V.maxHpFor(L, 6), mana = V.maxManaFor(L, 0);
  const m = BS.formulaStats({ level: L, role: 'regular', floor: Math.max(16, L), tier: 6, fit: 'both' });
  const blow = CB.monsterMaxHit({ atk: m.atk, tier: 6 });
  const skill = skillAt[L];
  /* a warhammer's largest blow: floor(0.35 x skill + 0.6 x strength + 2) less the monster's defence; gear FROZEN at Dawnsteel, and on the staged line (Dawnsteel x Level / 110) */
  const hitFrozen = Math.max(1, Math.floor(skill * 0.35 + strTop * 0.6 + 2) - CB.defenceReduction(m));
  const strLine = L >= 110 ? WL.lineWeapon('warhammer', L).strB : strTop;
  const hitLine = Math.max(1, Math.floor(skill * 0.35 + strLine * 0.6 + 2) - CB.defenceReduction(m));
  const swingsFrozen = m.hp / (hitFrozen / 2 * BS.STAT_FORMULA.heroHit), swingsLine = m.hp / (hitLine / 2 * BS.STAT_FORMULA.heroHit);
  /* the kills an hour the contract needs at this Level, and the seconds a kill may take (a hero alone, +15%) */
  const xpKill = m.xp * PX.SOLO_XP_PM / 1000, needKillsH = contract(L) / xpKill;
  return { L, hp, hpPlate, mana, monHp: m.hp, monXp: m.xp, monDef: m.def, monBlow: blow, blowShareOfHp: r2(blow / hp), skill, strLine, hitFrozen, hitLine, basicSecAKillFrozen: Math.round(swingsFrozen * 2), basicSecAKillLine: Math.round(swingsLine * 2),
    contractSecAKill: Math.round(3600 / needKillsH), frozenVsContract: r2(swingsFrozen * 2 / (3600 / needKillsH)), lineVsContract: r2(swingsLine * 2 / (3600 / needKillsH)) };
});

/* 4. A DEATH: the Level XP it takes, the hunted hours that is on the contract, the Levels it takes, Blessings' price */
out.death = LEVELS.filter((L) => L >= 10).map((L) => {
  const total = XP.charXpForLevel(L), loss = AR.levelDeathLoss(total), after = XP.charLevelFromXp(total - loss);
  const full = [1, 2, 3].reduce((s, t) => s + BL.blessingPrice(t, L), 0);
  return { L, lossXp: loss, hoursUnblessed: r1(loss / contract(L)), hoursBlessed3: r1(loss * 0.25 / contract(L)), levelsLost: L - after, blessingsGold: full };
});
/* JS and SQL: floor(x x 0.06) (action-rules.js, a float) against floor(x x 60 / 1000) (hr_death_xp_max, exact numeric) */
{
  const pm = Math.round(0.06 * 1000); let bad = 0, checked = 0; const samples = [];
  const exact = (x) => Number((BigInt(x) * BigInt(pm)) / 1000n);
  for (let x = 0; x <= 2000000; x++) { checked++; const a = AR.levelDeathLoss(x), b = exact(x); if (a !== b) { bad++; if (samples.length < 6) samples.push({ x, js: a, sql: b }); } }
  let big = 0, bigBad = 0, over = 0; let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 2000000; i++) { const x = Math.floor(rnd() * 9e15); big++; const a = AR.levelDeathLoss(x), b = exact(x); if (a !== b) { bigBad++; if (a > b) over++; if (samples.length < 12) samples.push({ x, js: a, sql: b }); } }
  for (const L of LEVELS) { const x = XP.charXpForLevel(L); if (AR.levelDeathLoss(x) !== exact(x)) samples.push({ L, x, js: AR.levelDeathLoss(x), sql: exact(x) }); }
  out.deathParity = { upTo2M: { checked, mismatches: bad }, upTo9e15: { checked: big, mismatches: bigBad, jsOverSql: over }, samples };
}

/* 5. TEMPERING and the gear ladder */
out.temper = Object.entries(TP.TEMPER_TIERS).map(([t, g]) => ({ tier: Number(t), wornAt: GT.MATERIAL_TIERS[Number(t) - 1].level, oneTrack: g.reduce((a, b) => a + b, 0), bothTracks: 2 * g.reduce((a, b) => a + b, 0), trackPm: TP.temperLadder('blows', Number(t)).pm * TP.TEMPER_RUNGS }));
out.gearLadder = GT.MATERIAL_TIERS.map((t, i) => ({ tier: t.tier, level: t.level, hammerStr: hammer.str[i], hammerStepPct: i ? r1((hammer.str[i] / hammer.str[i - 1] - 1) * 100) : null, plateBodyDef: GT.ARMOUR_SLOTS[1].def[i], bodyStepPct: i ? r1((GT.ARMOUR_SLOTS[1].def[i] / GT.ARMOUR_SLOTS[1].def[i - 1] - 1) * 100) : null }));

/* 6. PARTY: the Level XP a head, permille of a monster's kill, by size and classes (a hero alone 1150) */
out.party = { solo: PX.SOLO_XP_PM, perHead: Object.fromEntries([2, 3, 4].map((n) => [n, PX.PARTY_CLASS_XP[n].map((c) => Math.round(c / n))])) };

if (JSON_OUT) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const table = (title, rows) => { console.log('\n' + title); console.table(rows); };
table('1. LEVEL CURVE on the pace contract ' + CM.LEVEL_PACE.contract.a + ' x L^' + CM.LEVEL_PACE.contract.b, out.level.map((r) => ({ ...r, step: fmt(r.step), total: fmt(r.total) })));
table('   bracket rows (' + out.levelRows.length + ')', out.levelRows);
table('   seams: a step over 1.5x, or a Level taking under 0.9x / over 1.6x the hours of the one before', out.levelSeams);
console.log('   exact integer totals to Level ' + out.levelExactTo); console.table(out.levelTail);
table('2. COMBAT SKILL CURVE 15 x s^2 x 1.04^(s-1)', out.skill.map((r) => ({ ...r, step: fmt(r.step), total: fmt(r.total) })));
console.log('   the walk stops at skill ' + out.skillCeiling.lastReachableLevel + ' (2^53 XP)'); console.table(out.careerSkill);
table('3. HP, MANA AND THE SAME-LEVEL REGULAR', out.vitals);
table('4. A DEATH', out.death.map((r) => ({ ...r, lossXp: fmt(r.lossXp) })));
console.log('   JS vs SQL death share:', JSON.stringify(out.deathParity));
table('5. TEMPERING', out.temper); console.table(out.gearLadder);
console.log('\n6. PARTY XP a head (permille of the kill):', JSON.stringify(out.party));
