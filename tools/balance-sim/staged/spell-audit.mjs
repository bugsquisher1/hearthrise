#!/usr/bin/env node
// tools/balance-sim/staged/spell-audit.mjs — EVERY SPELL AT LEVELS 10 / 60 / 110 / 185 UNDER THE SPELL RULE
// (designer, lane/d-spell-audit, 2026-11-20, the numbers of docs/design/balance-program/32-spell-audit.md, plan lane L57; re-pointed at the
// built rule by lane/c-spell-rule, 2026-11-21, plan lane L17: every cast is a share of its caster's own blow, Tyler 21-5, 32-4, 32-8).
// NO PLAY: the game's own rows and functions read at four Levels. It grades nothing and writes nothing. The dark rows (the fist line's six
// strikes, the Necrotic and Storm sample of four) are read from a planted copy of src/data with their two switches on
// (tests/hunt-core/fixtures/h1.js plant), so the tree is untouched.
//
//   node tools/balance-sim/staged/spell-audit.mjs
//
// ONE CAST of the version a career caster holds, on a same-Level regular of a full ground, as the engine lands it: the caster's own
// largest blow is its unit's maxHit (src/core/member.js heroSnapshot: against a zero-defence foe), the cast's number is
// src/data/abilities.js castAmount of it at the version's step (runes.js versionStep), and a hit loses the monster's defence once in
// src/core/hunt/damage.js hurt, as a swing does. Damage as a share of that monster's HP and in the caster's own average LANDED swings
// (its real to-hit on that monster, src/data/to-hit.js); a heal or a shell as a share of the caster's HP and in monster blows.
// LEVEL 185: the kit is the Level 110 kit (the open grounds' "tier 7") and, beside it, the same kit with its weapon the formula piece of
// the tier a Level 185 hero wears (12-targets 8.3 a and 8.8: every tier the one gear formula at its item Level, src/core/gear-stats.js
// statsOfRow; the staged Dawnsteel line, x Level / 110, retired with 8.8). Skills past Level 100 are the projection spell-ratios.mjs uses
// (ASSUMED).
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadGear } from '../gear.mjs';
import { loadLines, skillsAt } from '../skill-lines.mjs';
import { sourceQuery } from '../../lib/version-stamp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const u = (root, p) => pathToFileURL(join(root, p)).href;
const v = sourceQuery(ROOT);
const BS = await import(u(ROOT, 'src/data/balance-sheet.js') + v);
const C = await import(u(ROOT, 'src/core/combat.js') + v);
const XP = await import(u(ROOT, 'src/core/xp.js') + v);
const { LEVEL_PACE } = await import(u(ROOT, 'src/data/core-model.js') + v);
const MEM = await import(u(ROOT, 'src/core/member.js') + v);
const { STATUSES } = await import(u(ROOT, 'src/data/statuses.js') + v);
const { RUNE_FAMILIES, RUNE_TIERS } = await import(u(ROOT, 'src/data/runes.js') + v);
const MC = await import(u(ROOT, 'src/data/monster-classes.js') + v);
const { MONSTERS } = await import(u(ROOT, 'src/data/monsters.js') + v);
const GSF = await import(u(ROOT, 'src/core/gear-stats.js') + v);
const { GEAR_STEPS } = await import(u(ROOT, 'src/data/gear-steps.js') + v);
/* the item Level of the tier a hero of Level L wears (one tier every tierSteps item Levels, worn from it less wearAhead) */
const wornIL = (L) => GEAR_STEPS.tierSteps * Math.floor((L + GEAR_STEPS.wearAhead) / GEAR_STEPS.tierSteps);
const { BAR_BUDGET } = await import(u(ROOT, 'tools/balance-program/guard-cells.mjs'));
const { plant } = await import(u(ROOT, 'tests/hunt-core/fixtures/h1.js'));
/* the dark rows: abilities.js of a planted copy with both switches on */
const planted = plant([['src/data/necrotic-storm.js', 'live: false,', 'live: true,'], ['src/data/fists.js', 'live: false,', 'live: true,']]);
let A;
try { A = await import(u(planted.root, 'src/data/abilities.js')); } finally { planted.done(); }
const LIVE = await import(u(ROOT, 'src/data/abilities.js') + v);
const gear = await loadGear(ROOT);
const lines = loadLines();
const top = lines.top;

const LEVELS = [10, 60, 110, 185];
const tierAt = (L) => (L < 15 ? 1 : L < 30 ? 2 : L < 45 ? 3 : L < 60 ? 4 : L < 75 ? 5 : 6);
/* hunted hours to a Level: the pace targets, from 0 hours at Level 1 */
const hoursAt = (L) => { const t = [[1, 0], ...LEVEL_PACE.targets.filter(([l]) => l > 1)]; for (let i = 1; i < t.length; i++) if (L <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (L - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); return t[t.length - 1][1]; };
const project = (way, k, L) => {
  const at = (x) => skillsAt(lines, 'alone', way, Math.min(x, top))[k];
  if (L <= top) return at(L);
  const s1 = at(top), s0 = at(top - 10);
  const rate = (XP.skillXpForLevel(k, s1) - XP.skillXpForLevel(k, s0)) / (hoursAt(top) - hoursAt(top - 10));
  return XP.skillLevelFromXp(k, XP.skillXpForLevel(k, s1) + rate * (hoursAt(L) - hoursAt(top)) * Math.sqrt(L / top));
};
const WAY = { shield: 'tank', sword: 'sword', dual_axe: 'axes', club: 'hammer', ranged: 'bow', destruction: 'mage', restoration: 'healer', fists: 'hammer' };
const MAIN = { tank: 'melee', sword: 'melee', axes: 'melee', hammer: 'melee', bow: 'ranged', mage: 'magic', healer: 'magic' };
const WAYS = ['hammer', 'sword', 'tank', 'axes', 'bow', 'mage', 'healer'];
/* a row many families hold is read on each way named here (else on its first discipline's) */
const READ_ON = { power_strike: ['tank', 'hammer'], turning_cut: ['sword', 'hammer'], flame_strike: ['sword'], mend: ['tank', 'hammer'], brand: ['sword'], reave: ['sword'] };
const verAt = (lv) => RUNE_TIERS.reduce((n, t) => (lv >= t.level ? t.tier : n), 1);
const pct = (x) => (x * 100).toFixed(0) + '%';
const x2 = (x) => x.toFixed(2);
const ROMAN = 'I II III IV V'.split(' ');

/* THE MONSTER OF A LEVEL (its aim and evasion too: the to-hit ratio) and THE HERO'S OWN BLOW there; `line`: the weapon the formula piece of the tier the Level wears, past 110 */
const monAt = (L) => {
  const tier = tierAt(L);
  const f = BS.formulaStats({ level: L, role: 'regular', tier, floor: Math.max(16, L - 8), fit: 'both' });
  const mon = { ...f, tier, level: L };
  return { mon, hp: f.hp, red: C.defenceReduction(mon), blow: C.monsterMaxHit(mon), heroHp: BS.STAT_FORMULA.refHp(L) };
};
/* the average of max(1, r - red) x pm / 1000 over a roll r of lo..hi: one hit as damage.js hurt lands it (no element, no stance) */
const landedAvg = (lo, hi, red, pm) => { let s = 0; for (let r = lo; r <= hi; r++) s += Math.floor(Math.max(1, r - red) * pm / 1000); return s / (hi - lo + 1); };
const blowAt = (way, L, line) => {
  let kit; try { kit = gear.kitOf(way, Math.min(L, 110), { uniques: true }); } catch { kit = gear.kitOf(way, Math.min(L, 110), {}); }
  const equipment = kit.equipment || kit;
  let items = gear.ITEMS;
  if (line && L > 110 && equipment.weapon && items[equipment.weapon]) {
    /* the same weapon's family, its stats the gear formula's at the item Level of the tier Level L wears */
    const w = { ...items[equipment.weapon], ...(GSF.statsOfRow(items[equipment.weapon], wornIL(L), items) || {}), iL: wornIL(L) };
    items = { ...items, [equipment.weapon]: w };
  }
  const sk = project(way, MAIN[way], L);
  const M = monAt(L);
  const eq = C.equipmentStats(equipment, items);
  const profile = kit.profile || (MEM.deriveProfile ? MEM.deriveProfile(eq.weaponType) : undefined);
  const ctx = { equipment, items, eq, skills: { [MAIN[way]]: XP.skillXpForLevel(MAIN[way], sk) }, ...(profile ? { profile } : {}) };
  /* the unit's maxHit is against a zero-defence foe (member.js heroSnapshot); the to-hit is against this monster */
  const own = C.playerCombatRolls({}, ctx), vs = C.playerCombatRolls(M.mon, ctx);
  return { skill: sk, maxHit: own.maxHit, acc: vs.accuracy, swing: vs.accuracy * landedAvg(1, own.maxHit, M.red, 1000) };
};
const memo = new Map();
const B = (way, L, line = false) => { const k = way + ':' + L + ':' + line; if (!memo.has(k)) memo.set(k, blowAt(way, L, line)); return memo.get(k); };

const kindOf = (row) => (A.landsBlow(row) ? 'dmg' : A.heals(row) ? 'heal' : A.shells(row) ? 'shell' : 'effect');
const waysOf = (row) => READ_ON[row.id] || [WAY[row.disciplines[0]] || 'hammer'];
const skillOf = (row, way, L) => project(way, row.skill || A.DISCIPLINE_SKILL[row.disciplines[0]] || 'melee', L);

/* ONE CAST at Level L on `way`: { n (version), mana, pm (its step), amt (average landed, or a heal or shell's whole number) } */
function cast(row, way, L, line = false) {
  const lv = skillOf(row, way, L), n = row.versions ? verAt(lv) : 1, ver = A.versionOf(row, n), M = monAt(L), b = B(way, L, line);
  const a = A.castAmount(row, b.maxHit, M.heroHp, ver.outPm);
  const amt = a.hit ? landedAvg(a.hit[0], a.hit[1], M.red, ver.outPm) * (row.hits || 1) : a.heal || a.shield;
  return { lv, n, mana: ver.mana, pm: ver.outPm, amt };
}
const share = (row) => row.hitPm || row.healPm || row.shieldPm || row.healHpPm;
const cell = (row, way, L, r, line) => {
  const M = monAt(L), b = B(way, L, line);
  return kindOf(row) === 'dmg'
    ? r.amt.toFixed(0) + ' = ' + pct(r.amt / M.hp) + ' of a monster, ' + x2(r.amt / b.swing) + ' swings'
    : r.amt.toFixed(0) + ' = ' + pct(r.amt / M.heroHp) + ' of HP, ' + x2(r.amt / M.blow) + ' blows';
};

console.log('SPELL AUDIT UNDER THE SPELL RULE (no play). A same-Level regular of a full ground; the caster on its career line (projected past ' + top + '). One cast on a rune of its own version (a store rune lands 75%). Version steps: ' + RUNE_TIERS.map((t) => t.stepPm).join(' / ') + '.');
console.log('\n1. THE MONSTER AND THE HERO: Level | hunted hours | monster HP | monster blow (max) | hero HP | defence off a hit');
for (const L of LEVELS) { const M = monAt(L); console.log([L, hoursAt(L).toFixed(0), M.hp, M.blow, M.heroHp, M.red].join(' | ')); }
console.log('\n2. THE OWN BLOW: way | ' + LEVELS.map((L) => 'L' + L + ': skill, max hit (the unit\'s), to-hit, average landed swing as a share of the monster').join(' | ') + ' | L185 on the formula: max hit');
for (const way of WAYS) console.log([way, ...LEVELS.map((L) => { const b = B(way, L); return b.skill + ', ' + b.maxHit + ', ' + pct(b.acc) + ', ' + pct(b.swing / monAt(L).hp); }), B(way, 185, true).maxHit].join(' | '));

console.log('\n3. EVERY ROW: id (ways, lane, cooldown s, target, rune family, unlock, live or dark) on its way, its share (permille of max hit, Mend of max HP) | then for each Level: version, mana: lands');
console.log('   damage: average landed = share of a monster, in own average landed swings. heal or shell: amount = share of the caster\'s HP, in monster blows.');
const liveIds = new Set(Object.keys(LIVE.ABILITIES));
for (const row of Object.values(A.ABILITIES)) {
  const kind = kindOf(row);
  const head = row.id + ' (' + row.disciplines.join('/').replace(Object.keys(A.DISCIPLINES).join('/'), 'every weapon') + ', ' + row.lane + ', ' + row.cdMs / 1000 + ' s, ' + row.target
    + ', ' + (row.rune ? row.rune.replace(/^chalked_|_rune$/g, '') : 'no rune') + ', ' + (row.unlock ? 'skill ' + row.unlock : 'from 1') + ', ' + (liveIds.has(row.id) ? 'live' : 'DARK')
    + (row.party ? ', party only' + (Array.isArray(row.party) ? ' for ' + row.party : '') : '') + (row.alone ? ', alone only' : '') + (row.replaces ? ', replaces ' + row.replaces : '') + ')';
  if (kind === 'effect') { console.log(head + ' | no number: ' + (row.status ? 'status ' + row.status : row.target === 'mark' ? '+' + row.bonusPct + '% for ' + row.durMs / 1000 + ' s' : 'taunt') + ', mana ' + row.mana); continue; }
  for (const way of waysOf(row)) {
    const cells = LEVELS.map((L) => { const r = cast(row, way, L); return 'L' + L + ': ' + ROMAN[r.n - 1] + ', ' + r.mana + ' mana: ' + cell(row, way, L, r); });
    console.log([head + ' on ' + way + ', share ' + share(row), ...cells, '185 on the formula: ' + cell(row, way, 185, cast(row, way, 185, true), true)].join(' | '));
  }
}

console.log('\n4. REND WITH ITS BLEED: Level | version | the two hits | one stack\'s six ticks | a cast in all (two stacks) | share of a monster | five stacks held, a second, as a share of a monster');
for (const L of LEVELS) {
  const row = A.ABILITIES.rend, r = cast(row, 'axes', L), s = STATUSES.bleed, M = monAt(L), b = B('axes', L);
  const scale = Math.max(1000, Math.floor(b.maxHit * s.blowPm * s.tierPermille[r.n - 1] / 1000));
  const tick = Math.max(1, Math.floor(((s.tick[0] + s.tick[1]) / 2 * scale + 500) / 1000) - M.red), stack = tick * (s.durationMs / s.everyMs);
  console.log([L, ROMAN[r.n - 1], r.amt.toFixed(0), stack.toFixed(0), (r.amt + 2 * stack).toFixed(0), pct((r.amt + 2 * stack) / M.hp), pct(5 * tick / M.hp)].join(' | '));
}

console.log('\n5. DEAD PAST A LEVEL (Levels 10 to 250 by 5): the first Level a cast is under half an own swing (the swing at a 95% to-hit, so the melee to-hit collapse past 165 does not flatter a cast; a row that hits several: under a quarter a target), or a heal or shell under half a monster blow');
for (const row of Object.values(A.ABILITIES)) {
  const kind = kindOf(row); if (kind === 'effect') continue;
  for (const way of waysOf(row)) {
    const bar = kind === 'dmg' ? (['area', 'line', 'ring'].includes(row.target) ? 0.25 : 0.5) : 0.5;
    let dead = null;
    for (let L = 10; L <= 250 && dead === null; L += 5) { const r = cast(row, way, L), M = monAt(L), b = B(way, L); if ((kind === 'dmg' ? r.amt / (0.95 * landedAvg(1, b.maxHit, M.red, 1000)) : r.amt / M.blow) < bar) dead = L; }
    console.log(row.id + ' on ' + way + ' | ' + (dead === null ? 'holds to 250' : 'Level ' + dead));
  }
}

console.log('\n6. THE OFFENSE LANE A FAMILY FILLS (G23: the sum of the lane over each offense row\'s cooldown, a row that replaces another shares its clock; cap ' + JSON.stringify(BAR_BUDGET) + ')');
const fill = (rows, d) => rows.filter((r) => r.lane === 'offense' && !r.replaces && r.disciplines.includes(d)).reduce((s, r) => s + A.ABILITY_LANES.offense / r.cdMs, 0);
const all = Object.values(A.ABILITIES), liveRows = all.filter((r) => liveIds.has(r.id));
console.log('family | cap | live | with the dark rows as written (their stand-ins are lanes L43 and L44)');
for (const d of Object.keys(A.DISCIPLINES)) {
  const cap = BAR_BUDGET[d] ?? BAR_BUDGET['*'];
  const f = (rows) => { const n = fill(rows, d); return x2(n) + (n > cap + 1e-9 ? ' OVER' : ''); };
  console.log([d, cap, LIVE.DISCIPLINES[d] ? f(liveRows) : 'dark', f(all)].join(' | '));
}

console.log('\n7. WHEN A ROW ARRIVES: skill in the row\'s own skill | the Level a career hero has it | hunted hours | what opens');
const opens = new Map();
const put = (s, way, what) => { const k = s + ':' + way; opens.set(k, [...(opens.get(k) || []), what]); };
for (const row of all) put(row.unlock || 1, waysOf(row)[0] + (row.skill === 'magic' && !row.universal ? ' (Magic)' : ''), row.id + (liveIds.has(row.id) ? '' : ' [dark]'));
for (const way of ['sword', 'mage']) RUNE_TIERS.slice(1).forEach((t, i) => put(t.level, way, 'version ' + ROMAN[i + 1] + ' of every rune spell (x' + (t.stepPm / 1000).toFixed(2) + ')'));
const levelWith = (way, k, s) => { for (let L = 1; L <= 400; L++) if (project(way, k, L) >= s) return L; return null; };
for (const [k, what] of [...opens.entries()].sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))) {
  const [s, wayRaw] = k.split(':'), way = wayRaw.replace(' (Magic)', '');
  const L = levelWith(way, wayRaw.includes('Magic') ? 'magic' : MAIN[way], Number(s));
  console.log([s, wayRaw + ' Level ' + L, hoursAt(L).toFixed(1), what.join(', ')].join(' | '));
}

console.log('\n8. RUNECRAFTING, CHAIN HOURS TO A LEVEL (23-items.md section 4: 46 chain hours to 60 and 1,073 to 99, one recipe from 60 up, so hours go with XP; 184 to 80 is its own check)');
{
  const xp = (L) => XP.skillXpForLevel('runecrafting', L), h = (L) => 46 + (xp(L) - xp(60)) / (xp(99) - xp(60)) * (1073 - 46);
  console.log([60, 65, 70, 75, 80, 85, 90, 95, 99].map((L) => 'RC ' + L + ': ' + h(L).toFixed(0) + ' h').join(' | '));
}

console.log('\n9. THE RUNE FAMILIES AND WHO SPENDS THEM: family | live spells | dark spells');
for (const fam of [...Object.keys(RUNE_FAMILIES), ...(RUNE_FAMILIES.bone ? [] : ['bone'])]) {
  const of = all.filter((r) => r.rune === 'chalked_' + fam + '_rune');
  console.log([fam + (RUNE_FAMILIES[fam] && !RUNE_FAMILIES[fam].hidden ? '' : ' (not in the game today)'), of.filter((r) => liveIds.has(r.id)).map((r) => r.id).join(', ') || 'none', of.filter((r) => !liveIds.has(r.id)).map((r) => r.id).join(', ') || 'none'].join(' | '));
}

console.log('\n10. WHO THE NEW ELEMENTS ARE STRONG ON (monster-classes.js NEW_ELEMENT_CLASSES as staged: mammal, vermin, humanoid, human take 15% more necrotic, undead 25% less; constructs 15% more storm, elementals 25% less): monsters by class');
{
  const by = {};
  for (const m of Object.values(MONSTERS)) { const c = m.cls || 'none'; by[c] = (by[c] || 0) + 1; }
  const n = Object.values(by).reduce((a, b) => a + b, 0), sum = (ks) => ks.reduce((s, k) => s + (by[k] || 0), 0);
  console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, k]) => c + ' ' + k).join(', '));
  console.log('of ' + n + ' monsters: weak to necrotic ' + sum(['mammal', 'vermin', 'humanoid', 'human']) + ' (' + pct(sum(['mammal', 'vermin', 'humanoid', 'human']) / n) + '), resist necrotic ' + sum(['undead'])
    + ', weak to storm ' + sum(['construct']) + ' (' + pct(sum(['construct']) / n) + '), resist storm ' + sum(['elemental']) + ' (the slimes halve both; classes: ' + Object.keys(MC.MONSTER_CLASSES).length + ')');
}
