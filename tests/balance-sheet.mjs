#!/usr/bin/env node
// tests/balance-sheet.mjs — THE TARGET SHEET AND THE STAT FORMULA HOLD THEIR OWN RULES (src/data/balance-sheet.js;
// lane/b-ground-formula, Tyler 2026-11-07 "is there a formula you can start following?"). Pure, about a second, no engine play
// (the measured half is tools/balance-sim/sheet-check.mjs on a plan 'formula' run).
//
//   restated-engine   the formula's damage scale per tier is combat.js's own number (it divides a blow by it, so a drift would write
//                     wrong rows silently)
//   same-level-read   every role at every Level 1-200 reads back through the ENGINE's own rolls (monsterAccuracy, playerCombatRolls,
//                     monsterMaxHit): its to-hit on the reference hero of its Level is the formula's and the reference hero's on it is
//                     STAT_FORMULA.heroHit x its role's evasion (each within a rounding point), and its blow is the formula's share of
//                     that hero's base HP (within one atk step)
// THE TO-HIT RATIO (src/data/to-hit.js; balance program 21-combat.md B2, Tyler 2026-11-20 ruled 21-1 and 21-2; build row L15):
//   ratio-holds       a same-Level regular on a full ground lands 70% on the career hero and the career hero 85% on it, within a point,
//                     at every Level 10 to 1,000; no role on any ground reaches a rail (TO_HIT.min / max) on the reference hero
//   defense-worth     +10 Defense cuts a same-Level regular's landed blows by 12-16% at Level 10 and 3-6.5% at 105, falling smoothly
//                     to Level 400 (the 11-18 "definitely NOT intended" Defense, fixed stats against stats)
//   every-row-rated   every monster row the engine can meet carries both ratings (aim, evasion), each at least 1
//   ref-hero-generated  to-hit.js REF_HERO is tools/gen-ref-hero.mjs's, row for row
//   harder-is-surer   a Danger step's dial (src/core/hunt/dial.js atTier) and an enrage (boss-phases.js swingRow) raise the aim as they
//                     raise the attack
//   blows-capped      no role's largest blow passes the sheet's regular cap at any Level (BALANCE_SHEET.blows)
//   curves-climb      HP, XP and coin never fall as a Level rises, for every role (a scaled ground only gets harder and richer)
//   (the `tiers` case, the one tier table's order, retired with TIER_DIALS: a ground plays its Danger scale step, 12-targets 8.4
//    item 4, held by tests/hunt-core/danger.mjs; lane/retire-tier-chain 2026-11-26)
//   roster            tools/gen-ground-stats.mjs names only real monsters and real roles, and its --selftest bites
//
// --mutate: each case is run against a planted wrong copy and must go red.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const { BUILD } = await import(u('src/build-info.js'));
const V = sourceQuery(ROOT);
const REAL = await import(u('src/data/balance-sheet.js'));
const C = await import(u('src/core/combat.js') + V);
const TH = await import(u('src/data/to-hit.js') + V);
const { atTier } = await import(u('src/core/hunt/dial.js') + V);
const { swingRow } = await import(u('src/core/hunt/boss-phases.js') + V);
const { MONSTERS } = await import(u('src/data/monsters.js'));
const GEN = await import(u('tools/gen-ground-stats.mjs'));
const GENREF = await import(u('tools/gen-ref-hero.mjs'));
const { skillXpForLevel } = await import(u('src/core/xp.js') + V);

/* THE REFERENCE HERO'S BLOW at Level L (its weapon skill and worn accuracy, to-hit.js refHeroAt) and its defense rating, through the
   engine's own rolls: a hammer whose one worn piece carries the reference accuracy. */
const refRolls = (X, L, row, plus = { main: 0, defense: 0 }) => {
  const r = X.T.refHeroAt(L), CC = X.C || C;
  const items = { __ref: { atkB: r.accuracy } };
  const heroHit = CC.playerCombatRolls(row, { skills: { melee: skillXpForLevel('melee', Math.round(r.main) + plus.main) }, equipment: { weapon: '__ref' }, items }).accuracy;
  return { heroHit, monHit: CC.monsterAccuracy(row, Math.round(r.defense) + plus.defense), r };
};
/* the rows the engine meets that are built at fight time (the Tower's rooms, a scaled hunt's table) read formulaStats, so the formula's
   own answers stand for them in every-row-rated */
const REF_ROWS = await GENREF.refRows(ROOT);
const X_REAL = Object.freeze({ T: TH, C, atTier, swingRow, refRows: null });
/* a monster of the ratio's own rule: its two ratings and nothing else */
const ratioRow = (f) => ({ atk: f.atk, aim: f.aim, evasion: f.evasion, def: f.def, tier: 1 });

const CASES = {
  'restated-engine': (B) => {
    const bad = [];
    for (const t of [1, 2, 3, 4, 5, 6]) {
      const engine = C.COMBAT_BALANCE.monsterDamageScaleByTier[t] || C.COMBAT_BALANCE.monsterAttackDamageScale;
      if (B.DAMAGE_SCALE_BY_TIER[t] !== engine) bad.push('tier ' + t + ' damage scale ' + B.DAMAGE_SCALE_BY_TIER[t] + ', the engine\'s ' + engine);
    }
    return bad;
  },
  'same-level-read': (B) => {
    const bad = [];
    for (const role of B.ROLE_IDS) for (let L = 1; L <= 200; L++) for (const tier of [1, 3, 5]) for (const floor of [1, 16]) {
      const f = B.formulaStats({ level: L, role, tier, floor }, { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES });
      const row = { ...ratioRow(f), tier };
      const { heroHit, monHit, r } = refRolls(X_REAL, L, row);
      const want = TH.heldToHit(f.hitVsSameLevel);
      /* WITHIN A ROUNDING POINT (lane/refhero-recut, 2026-11-27): the aim is a whole number and the hero's Defense a whole level, so the grain is
         what half a point of each moves the roll. It passes 1.5 points where the ratings are small: on the clock's reference hero a Level 11
         hero rates 24 (Defense 4.4 rounds to 4), where the old one rated 31 */
      const d = TH.TO_HIT.base + r.defense;
      const grain = want < 0.5 ? 0.5 / (2 * d) + (0.5 * want) / d : (0.5 * d) / (2 * row.aim * row.aim) + 0.5 / (2 * row.aim);
      if (Math.abs(monHit - want) > Math.max(0.0151, grain)) { bad.push(role + ' L' + L + ' T' + tier + ' floor ' + floor + ': to-hit ' + monHit.toFixed(3) + ' on the reference hero, the formula ' + want); break; }
      const ev = B.MONSTER_ROLES[role].evasion, wantHero = TH.heldToHit(1 - (1 - B.STAT_FORMULA.heroHit) * ev);
      if (Math.abs(heroHit - wantHero) > 0.0151) { bad.push(role + ' L' + L + ': the reference hero lands ' + heroHit.toFixed(3) + ', the formula ' + wantHero.toFixed(3)); break; }
      const share = C.monsterMaxHit(row) / B.STAT_FORMULA.refHp(L), step = B.DAMAGE_SCALE_BY_TIER[tier] / B.STAT_FORMULA.refHp(L);
      if (f.atk > 1 && Math.abs(share - f.blowShare) > step) { bad.push(role + ' L' + L + ' T' + tier + ': blow ' + share.toFixed(3) + ' of HP, the formula ' + f.blowShare); break; }
    }
    return bad;
  },
  'ratio-holds': (B, M, X = X_REAL) => {
    const bad = [], T = X.T;
    const levels = [...new Set([10, 15, 30, 60, 85, 110, 165, 185, 240, 300, 400, 600, 1000, 1500])];
    for (const L of levels) {
      const f = B.formulaStats({ level: L, role: 'regular', tier: 6, floor: Math.max(16, L - 5) }, { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES });
      const fr = { ...ratioRow(f), tier: 6 };
      /* THE RULING (Tyler 2026-11-20, 21-2: "a same-Level monster lands 70% on the career hero, 85% / 70% at every Level 10-400"), typed
         here so a formula that drifts off it can't agree with itself */
      const want = { heroHit: 0.85, monHit: 0.70 };
      const got = refRolls(X, L, fr);
      for (const k of ['heroHit', 'monHit']) if (Math.abs(got[k] - want[k]) > 0.0101) bad.push('Level ' + L + ': ' + (k === 'heroHit' ? 'the career hero lands ' : 'a same-Level regular lands ') + (got[k] * 100).toFixed(1) + '%, the ruling ' + want[k] * 100 + '%');
    }
    for (const role of B.ROLE_IDS) for (let L = 1; L <= 1000; L += (L < 100 ? 1 : 7)) for (const floor of [1, 8, 16]) {
      const f = B.formulaStats({ level: L, role, tier: 6, floor }, { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES });
      const got = refRolls(X, L, ratioRow(f));
      for (const k of ['heroHit', 'monHit']) if (!(got[k] > T.TO_HIT.min && got[k] < T.TO_HIT.max)) { bad.push(role + ' L' + L + ' floor ' + floor + ': ' + k + ' sits on a rail (' + got[k] + ')'); break; }
      if (bad.length > 4) return bad;
    }
    return bad;
  },
  'defense-worth': (B, M, X = X_REAL) => {
    const bad = [], T = X.T;
    const cut = (L) => {
      const f = B.formulaStats({ level: L, role: 'regular', tier: 6, floor: Math.max(16, L - 5) }, { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES });
      const row = ratioRow(f), was = refRolls(X, L, row).monHit, now = refRolls(X, L, row, { main: 0, defense: 10 }).monHit;
      return 1 - now / was;
    };
    const at10 = cut(10), at105 = cut(105);
    if (!(at10 >= 0.12 && at10 <= 0.16)) bad.push('+10 Defense at Level 10 cuts ' + (at10 * 100).toFixed(1) + '% of the landed blows, the ruling 14%');
    if (!(at105 >= 0.03 && at105 <= 0.065)) bad.push('+10 Defense at Level 105 cuts ' + (at105 * 100).toFixed(1) + '%, the ruling 3-5%');
    let was = Infinity;
    for (let L = 10; L <= 400; L += 5) { const c = cut(L); if (c > was + 0.002) { bad.push('+10 Defense is worth more at Level ' + L + ' (' + (c * 100).toFixed(1) + '%) than at ' + (L - 5)); break; } was = c; }
    return bad;
  },
  'every-row-rated': (B, M = MONSTERS) => {
    const bad = [];
    for (const [id, m] of Object.entries(M)) if (!(Number.isFinite(m.aim) && m.aim >= 1 && Number.isFinite(m.evasion) && m.evasion >= 1)) bad.push(id + ' carries aim ' + m.aim + ', evasion ' + m.evasion);
    for (const role of B.ROLE_IDS) for (const L of [1, 50, 400]) {
      const f = B.formulaStats({ level: L, role, tier: 3, floor: 16 }, { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES });
      if (!(Number.isInteger(f.aim) && f.aim >= 1 && Number.isInteger(f.evasion) && f.evasion >= 1)) bad.push('the formula writes a ' + role + ' at ' + L + ' aim ' + f.aim + ', evasion ' + f.evasion);
    }
    return bad;
  },
  'ref-hero-generated': (B, M, X = X_REAL) => {
    const bad = [], want = X.refRows || REF_ROWS, have = X.T.REF_HERO;
    if (JSON.stringify(want) !== JSON.stringify(have.map((r) => [...r]))) {
      const i = want.findIndex((r, k) => JSON.stringify(r) !== JSON.stringify(have[k] && [...have[k]]));
      bad.push('REF_HERO row ' + i + ' is ' + JSON.stringify(have[i] && [...have[i]]) + ', the generator\'s ' + JSON.stringify(want[i]) + ' (node tools/gen-ref-hero.mjs, then the formula rows)');
    }
    return bad;
  },
  'harder-is-surer': (B, M = MONSTERS, X = X_REAL) => {
    const bad = [];
    const row = { ...M.gray_wolf };
    const t = X.atTier(row, { dmgPm: 1330 });
    if (Math.abs(t.aim - row.aim * 1.33) > 1e-9 || Math.abs(t.atk - row.atk * 1.33) > 1e-9) bad.push('a 1330 tier dial reads atk ' + t.atk + ' and aim ' + t.aim + ' of ' + row.atk + ' and ' + row.aim);
    const boss = Object.keys(M).find((id) => M[id].phases && Number.isInteger(M[id].phases.enrageAtkPm) && M[id].phases.enrageAtkPm > 1000);
    const b = M[boss], s = X.swingRow({ kind: boss, hp: 1, maxHp: 1000 }, b);
    if (Math.abs(s.aim - (b.aim * b.phases.enrageAtkPm) / 1000) > 1e-9) bad.push(boss + ' enraged swings aim ' + s.aim + ', want ' + (b.aim * b.phases.enrageAtkPm) / 1000);
    return bad;
  },
  'blows-capped': (B) => {
    const bad = [];
    for (const role of B.ROLE_IDS) for (let L = 1; L <= 200; L++) {
      const f = B.formulaStats({ level: L, role, tier: 2, floor: L }, { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES });
      if (f.blowShare > B.BALANCE_SHEET.blows.regularMaxShare) { bad.push(role + ' L' + L + ': blow ' + f.blowShare + ' of a same-Level hero, cap ' + B.BALANCE_SHEET.blows.regularMaxShare); break; }
    }
    return bad;
  },
  'curves-climb': (B) => {
    const bad = [];
    for (const role of B.ROLE_IDS) {
      let was = null;
      for (let L = 1; L <= 200; L++) {
        const f = B.formulaStats({ level: L, role, tier: 2, floor: L }, { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES });
        /* coin is the roll's MEAN (STAT_FORMULA.gp.keepMean: lo..2 x mean - lo, so the top can step down a coin as the bottom steps up) */
        if (was && (f.hp < was.hp || f.xp < was.xp || f.gp[0] + f.gp[1] < was.gp[0] + was.gp[1])) { bad.push(role + ' falls from Level ' + (L - 1) + ' to ' + L); break; }
        was = f;
      }
    }
    if (!(B.rampAt(B.STAT_FORMULA.ramp.from) === 0 && B.rampAt(B.STAT_FORMULA.ramp.to) === 1)) bad.push('the danger ramp does not run 0 to 1 over its Levels');
    return bad;
  },
  roster: () => {
    const bad = [];
    for (const [g, rows] of Object.entries(GEN.ROSTER)) for (const [id, role] of Object.entries(rows)) {
      if (!MONSTERS[id]) bad.push(g + ': ' + id + ' is not a monster');
      if (!REAL.MONSTER_ROLES[role]) bad.push(g + ': ' + id + ' has no role ' + role);
    }
    try { execFileSync(process.execPath, [join(ROOT, 'tools/gen-ground-stats.mjs'), '--selftest'], { stdio: 'pipe' }); } catch (e) { bad.push('gen-ground-stats --selftest is red: ' + String(e.stdout || e.message).trim()); }
    return bad;
  },
  /* THE FENCE: every row that says `formula: true` (monster-classes.js auditRoster then skips its hand bands) is the formula's, digit
     for digit, and stands on the roster; a ground the formula has written has every one of its roster rows written. */
  'rows-are-the-formula': (B, M = MONSTERS) => {
    const bad = [], D = { MONSTERS: M, formulaStats: B.formulaStats, floorOf: GEN_D.floorOf, fitOf: GEN_D.fitOf };
    const onRoster = new Set(Object.values(GEN.ROSTER).flatMap((r) => Object.keys(r)));
    for (const [id, m] of Object.entries(M)) if (m && m.formula === true && !onRoster.has(id)) bad.push(id + ' says formula: true and is on no ground\'s roster');
    for (const g of Object.keys(GEN.ROSTER)) {
      const rows = GEN.proposeGround(g, D), written = rows.filter((r) => M[r.id].formula === true);
      if (written.length && written.length !== rows.length) bad.push(g + ': ' + written.length + ' of ' + rows.length + ' roster rows written (a ground moves whole)');
      for (const r of written) if (r.drift.length) bad.push(r.id + ' (' + g + '): ' + r.drift.map((k) => k + ' ' + JSON.stringify(r.today[k]) + ', the formula ' + JSON.stringify(r.formula[k])).join('; '));
    }
    return bad;
  },
};
/* the generator's own ground readers (floor and fit from src/data), for the fence */
const GEN_D = await (async () => {
  const { HUNT_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  return { floorOf: (g) => HUNT_INDEX[HUNT_GROUNDS[g].hunt].band[0], fitOf: (g) => (HUNT_GROUNDS[g].pockets.some((p) => p.forParty) ? 'party' : HUNT_GROUNDS[g].groupFit || 'both') };
})();

/* THE MUTANTS: a planted copy of the module with one rule broken; the named case must go red on it. */
const plant = (patch) => {
  const B = { ...REAL, ...patch };
  const opts = { formula: B.STAT_FORMULA, roles: B.MONSTER_ROLES };
  B.formulaStats = (spec, o) => REAL.formulaStats(spec, { ...opts, ...(o || {}) });
  return B;
};
const MUTANTS = [
  ['restated-engine', 'tier 3 scale restated as 5.4', () => plant({ DAMAGE_SCALE_BY_TIER: { ...REAL.DAMAGE_SCALE_BY_TIER, 3: 5.4 } })],
  ['same-level-read', 'an aim written for a to-hit ten points over the formula\'s', () => { const B = plant({}); B.formulaStats = (spec, o) => { const f = REAL.formulaStats(spec, o); return { ...f, aim: Math.round(TH.aimFor(f.hitVsSameLevel + 0.1, spec.level)) }; }; return B; }],
  ['same-level-read', 'an evasion that forgets its role', () => { const B = plant({}); B.formulaStats = (spec, o) => { const f = REAL.formulaStats(spec, o); return { ...f, evasion: Math.round(TH.evasionFor(REAL.STAT_FORMULA.heroHit, spec.level)) }; }; return B; }],
  ['ratio-holds', 'the career hero written to land 80%', () => plant({ STAT_FORMULA: { ...REAL.STAT_FORMULA, heroHit: 0.80 } })],
  ['ratio-holds', 'a full ground\'s regular written onto the rail (hit 0.99)', () => plant({ STAT_FORMULA: { ...REAL.STAT_FORMULA, hit: { lo: 0.40, hi: 0.99 } } })],
  ['defense-worth', 'the engine without its base rating (+10 Defense a doubling at Level 10)', () => ({ X: { ...X_REAL, C: { playerCombatRolls: C.playerCombatRolls, monsterAccuracy: (row, d) => TH.heldToHit(TH.toHitRatio(row.aim, d)) } } })],
  ['defense-worth', 'the old straight line (Defense worth nothing past Level 60)', () => ({ X: { ...X_REAL, C: { playerCombatRolls: C.playerCombatRolls, monsterAccuracy: (row, d) => Math.max(0.05, Math.min(0.85, 0.5 + (row.atk - d) * 0.02)) } } })],
  ['every-row-rated', 'a hand row without its aim', () => ({ M: { ...MONSTERS, yard_dummy: { ...MONSTERS.yard_dummy, aim: undefined } } })],
  ['every-row-rated', 'a pack row with no evasion', () => ({ M: { ...MONSTERS, gatekeeper: { ...MONSTERS.gatekeeper, evasion: 0 } } })],
  ['ref-hero-generated', 'a REF_HERO cell one point off', () => ({ X: { ...X_REAL, T: { ...TH, REF_HERO: TH.REF_HERO.map((r, i) => (i === 12 ? [r[0], r[1] + 1, r[2], r[3]] : r)) } } })],
  ['harder-is-surer', 'a tier that raises the blow and not the aim', () => ({ X: { ...X_REAL, atTier: (row, d) => ({ ...row, atk: (row.atk * d.dmgPm) / 1000 }) } })],
  ['harder-is-surer', 'an enrage that raises the blow and not the aim', () => ({ X: { ...X_REAL, swingRow: (uu, row) => ({ ...row, atk: Math.floor(row.atk * 1.5) }) } })],
  ['blows-capped', 'a regular blow of 40% of HP', () => plant({ STAT_FORMULA: { ...REAL.STAT_FORMULA, blow: { lo: 0.10, hi: 0.40 } } })],
  ['curves-climb', 'HP falling past Level 100', () => { const B = plant({}); B.formulaStats = (spec, o) => { const f = REAL.formulaStats(spec, o); return { ...f, hp: spec.level > 100 ? f.hp - spec.level : f.hp }; }; return B; }],
  ['curves-climb', 'coin falling past Level 100', () => { const B = plant({}); B.formulaStats = (spec, o) => { const f = REAL.formulaStats(spec, o); return { ...f, gp: spec.level > 100 ? [f.gp[0] - 1, f.gp[1] - spec.level] : f.gp }; }; return B; }],
];

/* a roster with one ground written by the formula, then one of its rows nudged off it, or one row left behind */
const writtenGround = (nudge) => {
  const g = 'wickstead', D = { MONSTERS, formulaStats: REAL.formulaStats, floorOf: GEN_D.floorOf, fitOf: GEN_D.fitOf };
  const M = { ...MONSTERS };
  for (const r of GEN.proposeGround(g, D)) M[r.id] = { ...MONSTERS[r.id], ...r.formula, formula: true };
  nudge(M, Object.keys(GEN.ROSTER[g]));
  return M;
};
MUTANTS.push(['rows-are-the-formula', 'a written row one atk point off', () => ({ M: writtenGround((M, ids) => { M[ids[0]] = { ...M[ids[0]], atk: M[ids[0]].atk + 1 }; }) })]);
MUTANTS.push(['rows-are-the-formula', 'a ground written all but one row', () => ({ M: writtenGround((M, ids) => { const { formula, ...hand } = M[ids[1]]; M[ids[1]] = hand; }) })]);
MUTANTS.push(['rows-are-the-formula', 'a hand row off every roster flagged as the formula\'s', () => {
  const onRoster = new Set(Object.values(GEN.ROSTER).flatMap((r) => Object.keys(r)));
  const off = Object.keys(MONSTERS).find((id) => !onRoster.has(id));
  return { M: { ...MONSTERS, [off]: { ...MONSTERS[off], formula: true } } };
}]);
MUTANTS.push(['rows-are-the-formula', 'a written row\'s coin doubled', () => ({ M: { ...MONSTERS, rat_king: { ...MONSTERS.rat_king, gp: MONSTERS.rat_king.gp.map((g) => g * 2) } } })]);

const mutate = process.argv.includes('--mutate');
let red = 0;
for (const [name, fn] of Object.entries(CASES)) {
  const bad = fn(REAL, MONSTERS, X_REAL);
  if (bad.length) { red++; console.error('  RED  ' + name + '\n        ' + bad.slice(0, 5).join('\n        ')); } else console.log('  ok   ' + name);
}
if (mutate) for (const [name, what, make] of MUTANTS) {
  const made = make();
  /* a mutant plants a module copy (B), a roster (M) or the ratio's pieces (X) */
  const bad = made.M || made.X ? CASES[name](REAL, made.M || MONSTERS, made.X || X_REAL) : CASES[name](made, MONSTERS, X_REAL);
  if (!bad.length) { red++; console.error('  MUTANT SURVIVED  ' + name + ': ' + what); } else console.log('  caught  ' + name + ': ' + what);
}
if (red) { console.error('balance-sheet: RED (' + red + ')'); process.exit(1); }
console.log('balance-sheet: green' + (mutate ? ' (' + MUTANTS.length + ' mutants caught)' : ''));
