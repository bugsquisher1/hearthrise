#!/usr/bin/env node
// tools/balance-sim/staged/tohit-ratio.mjs — THE TO-HIT RATIO, MEASURED BEFORE IT IS BUILT (designer, lane/d-balance-combat, 2026-11-20).
// A measuring tool of the balance program's combat dive (docs/design/balance-program/21-combat.md). It grades nothing and writes
// nothing under src/: the proposal is played on a PLANTED COPY of src/core, src/data and the edge settle (tests/hunt-core/fixtures/h1.js
// plant), through the settle the world tick runs (cell.mjs), with the same dice as today's engine (paired seeds).
//
// THE PROPOSAL (stats against stats; no hero Level is read in a blow, Tyler 2026-11-18):
//   chance(attack, defense) = attack >= defense ?  1 - defense / (2 x attack)  :  attack / (2 x defense)
//   a hero's blow:     attack = its weapon skill + the worn accuracy (as today);   defense = the monster's WARD rating
//   a monster's blow:  attack = the monster's AIM rating;                           defense = Defense + guard (as today)
// A monster's two ratings are AUTHORED, like every monster stat, from its own Level against the REFERENCE HERO of that Level, and the
// reference hero's skills are the measured career line (tools/balance-sim/skill-lines.json, the lone hammer; past its top, projected on
// the skill curve's own cost, the same projection as `measure.mjs curves`), not "every skill at the Level":
//   aim  = refDefense(L) / (2 x (1 - hit))     hit = the row's to-hit at the reference hero as STAT_FORMULA wrote it (0.40 gentle .. 0.70 full,
//                                               x its role), read off the row: baseAcc + (atk - L) x 0.02. A tier's harder blow raises atk, so it
//                                               raises the aim the same way it does today.
//   ward = 2 x (1 - heroHit) x (refMain(L) + refAccuracy(L)) x the row's defense against a regular's of its Level (its role's armor)
// In the game these would be two generated row fields (tools/gen-ground-stats.mjs); here they are derived from the row at fight time so
// the planted copy needs no regenerated rows. --hero-hit sets the reference hero's to-hit on a regular (default 0.85); --mhit overrides
// every row's `hit` (default: the row's own); --blow multiplies every monster blow (default 1).
//
//   node tools/balance-sim/staged/tohit-ratio.mjs formula [--hero-hit 0.85]
//        NO PLAY. A same-Level regular on a full ground against (a) the career hammer, (b) a hero 9 under the line on its main skill
//        (a real own-four hero, 10-real-players section 3), (c) a back-row Defense of 15; today and on the ratio, at Levels 10..400,
//        and what +10 of each skill is worth on both.
//   node tools/balance-sim/staged/tohit-ratio.mjs play [--at thicket,glade,...] [--seat lone|mage|four] [--hours 1] [--seeds 2]
//                                                     [--level N] [--hero-hit 0.85] [--mhit 0.70] [--blow 1.0] [--bump N]
//        PLAY. The reference cell of measure.mjs at each point on today's engine and on the planted ratio, the same seeds.
//        --level N plays the seat at Level N on that ground (the real four hunts 15 to 30 Levels under a point); --bump N raises
//        the main skill and Defense N over the line on both engines (what training is worth before and after).
// Exit 0 when it ran, 2 on a bad argument.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCellRunner } from '../cell.mjs';
import { loadGear } from '../gear.mjs';
import { loadLines, skillsAt } from '../skill-lines.mjs';
import { sourceQuery } from '../../lib/version-stamp.mjs';
import { REF_POINTS, REF_SEATS } from '../../balance-program/model.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];
const bad = (m) => { console.error(m); process.exit(2); };
const mean = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0);
const MAIN = { hammer: 'melee', tank: 'melee', sword: 'melee', axes: 'melee', mage: 'magic', healer: 'magic', bow: 'ranged', crossbow: 'ranged' };
const HERO_HIT = Number(arg('hero-hit', 0.85));
const MHIT = arg('mhit') ? Number(arg('mhit')) : null;
const BLOW = Number(arg('blow', 1));
/* --base N: a flat rating every attacker and defender has before its skill (a body's own aim and footing), so +10 of a skill is not a doubling at Level 10 */
const BASE = Number(arg('base', 20));
const LEVELS = [10, 30, 60, 110, 165, 240, 400];
/* --deadly-dmg N: Deadly's blow dial (TIER_DIALS.deadly.dmgPm, 1330 today), planted on BOTH engines; --engines today|ratio|both */
const DEADLY_DMG = arg('deadly-dmg') ? Number(arg('deadly-dmg')) : null;
const ENGINES = String(arg('engines', 'both'));
/* --dangerous-dmg N: Dangerous's blow dial (TIER_DIALS.dangerous.dmgPm, 1170 today), planted the same way */
const DANGEROUS_DMG = arg('dangerous-dmg') ? Number(arg('dangerous-dmg')) : null;
const dialEdits = () => (DEADLY_DMG ? [['src/data/balance-sheet.js', 'deadly: Object.freeze({ pull: 8, lift: 1, dmgPm: 1330,', 'deadly: Object.freeze({ pull: 8, lift: 1, dmgPm: ' + DEADLY_DMG + ',']] : []).concat(DANGEROUS_DMG ? [['src/data/balance-sheet.js', 'dangerous: Object.freeze({ pull: 8, lift: 0.8, dmgPm: 1170,', 'dangerous: Object.freeze({ pull: 8, lift: 0.8, dmgPm: ' + DANGEROUS_DMG + ',']] : []);
const tierAt = (L) => (L < 15 ? 1 : L < 30 ? 2 : L < 45 ? 3 : L < 60 ? 4 : L < 75 ? 5 : 6);

/* ── THE REFERENCE HERO: [Level, main skill, Defense, worn accuracy] every 5 Levels to 100, then the projection ─────────────────── */
/* gear0: the cell runner's own gear (ONE loadGear a tree: a second one finds the staged rows already registered and dresses a staged kit differently) */
async function referenceTable(gear0) {
  const v = sourceQuery(ROOT);
  const XP = await import(u('src/core/xp.js') + v);
  const { LEVEL_PACE } = await import(u('src/data/core-model.js') + v);
  const gear = gear0 || await loadGear(ROOT);
  const lines = loadLines();
  const top = lines.top;
  const hoursAt = (L) => { const t = LEVEL_PACE.targets; for (let i = 1; i < t.length; i++) if (L <= t[i][0]) return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * (L - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); return t[t.length - 1][1]; };
  const lineAt = (k, L) => skillsAt(lines, 'alone', 'hammer', Math.min(L, top))[k];
  const project = (k, L) => {
    if (L <= top) return lineAt(k, L);
    const s1 = lineAt(k, top), s0 = lineAt(k, top - 10);
    const rate = (XP.skillXpForLevel(k, s1) - XP.skillXpForLevel(k, s0)) / (hoursAt(top) - hoursAt(top - 10));
    return XP.skillLevelFromXp(k, XP.skillXpForLevel(k, s1) + rate * (hoursAt(L) - hoursAt(top)) * Math.sqrt(L / top));
  };
  const accOf = (L) => { const kit = gear.kitOf('hammer', Math.min(L, 110), { uniques: true }); let a = 0; for (const id of Object.values(kit.equipment || kit)) { const it = gear.ITEMS[id]; if (it) a += it.atkB || 0; } return a; };
  const rows = [];
  for (const L of [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 125, 140, 165, 200, 240, 300, 400]) {
    rows.push([L, project('melee', Math.max(5, L)), project('defense', Math.max(5, L)), accOf(Math.max(5, L))]);
  }
  return { rows, XP, gear, lines, project, accOf };
}

/* ── THE PLANT: combat.js's two to-hit rules as ratios ──────────────────────────────────────────────────────────────────────────── */
function edits(ref) {
  const helper = `
/* PLANTED (tools/balance-sim/staged/tohit-ratio.mjs): the to-hit ratio and the monster ratings it reads. */
const TR_REF = ${JSON.stringify(ref.rows)};
function trRef(L, i) { const T = TR_REF; if (L <= T[0][0]) return T[0][i]; for (let k = 1; k < T.length; k++) if (L <= T[k][0]) { const a = T[k - 1], b = T[k]; return a[i] + (b[i] - a[i]) * (L - a[0]) / (b[0] - a[0]); } return T[T.length - 1][i]; }
const TR_TIER_L = { 1: 5, 2: 15, 3: 30, 4: 45, 5: 60, 6: 90 };
function trLevel(m) { return m && Number.isInteger(m.level) && m.level > 0 ? m.level : (TR_TIER_L[(m && m.tier) || 1] || 1); }
export function ratioHit(a, d) { const A = Math.max(1, a), D = Math.max(1, d); return A >= D ? 1 - D / (2 * A) : A / (2 * D); }
function trWard(m) {
  const L = trLevel(m), reg = 0.08 * L + 0.5 * Math.max(0, L - 20);
  const role = reg >= 4 ? Math.max(0.6, Math.min(1.8, ((m && m.def) || 0) / reg)) : 1;
  return 2 * (1 - ${HERO_HIT}) * (trRef(L, 1) + trRef(L, 3) + ${BASE}) * role;
}
function trAim(m, base) {
  const L = trLevel(m);
  const hit = Math.max(0.05, Math.min(0.95, ${MHIT === null ? "base + ((((m && m.atk) || 1) - L) * 0.02)" : String(MHIT) + " + 0 * base"}));
  const d = trRef(L, 2) + ${BASE};
  return hit >= 0.5 ? d / (2 * (1 - hit)) : 2 * hit * d;
}
`;
  const e = [
    ['src/core/combat.js', 'export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }', 'export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }\n' + helper],
    ['src/core/combat.js', 'let accuracy = 0.55 + (((accLvl + accBonus) - defScore) * 0.01);', 'let accuracy = ratioHit(accLvl + accBonus + ' + BASE + ', trWard(monster));'],
    ['src/core/combat.js', 'accuracy = Math.max(0.15, Math.min(0.95, accuracy));', 'accuracy = Math.max(0.05, Math.min(0.97, accuracy));'],
    ['src/core/combat.js', "return clamp(base + ((((monster && monster.atk) || 1) - playerDefense) * b.monsterAccuracyPerPoint),\n    b.monsterMinAccuracy, b.monsterMaxAccuracy);",
      'return clamp(ratioHit(trAim(monster, base), playerDefense + ' + BASE + '), 0.05, 0.97);'],
  ];
  if (BLOW !== 1) e.push(['src/core/combat.js', "return Math.max(1, Math.floor(((monster && monster.atk) || 1) * scale));", "return Math.max(1, Math.floor(((monster && monster.atk) || 1) * scale * " + BLOW + "));"]);
  return e;
}

/* ── formula: no play ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function formula() {
  const ref = await referenceTable();
  const v = sourceQuery(ROOT);
  const BS = await import(u('src/data/balance-sheet.js') + v);
  const C = await import(u('src/core/combat.js') + v);
  const at = (L, i) => { const T = ref.rows; if (L <= T[0][0]) return T[0][i]; for (let k = 1; k < T.length; k++) if (L <= T[k][0]) { const a = T[k - 1], b = T[k]; return a[i] + (b[i] - a[i]) * (L - a[0]) / (b[0] - a[0]); } return T[T.length - 1][i]; };
  const ratio = (a, d) => (a >= d ? 1 - d / (2 * a) : a / (2 * d));
  const p = (x) => (x * 100).toFixed(0) + '%';
  console.log('TO-HIT, TODAY AND ON THE RATIO (no play). A same-Level regular on a full ground (formulaStats). Reference hero: the lone hammer career line, projected past Level 100. hero-hit target ' + HERO_HIT + ', base rating ' + BASE + '.');
  console.log('Level | ref main / Defense / worn accuracy | monster atk, def, hit as written | HERO TO-HIT today: career / 9 under | ratio: career / 9 under | MONSTER TO-HIT today: career / front seat 9 under / back row (Defense 15) | ratio: career / front 9 under / back row | +10 main skill, to-hit points: today / ratio | +10 Defense, damage taken: today / ratio | 10 skill levels cost, main (XP)');
  for (const L of LEVELS) {
    const tier = tierAt(L);
    const s = BS.formulaStats({ level: L, role: 'regular', tier, floor: Math.max(16, L - 5), ground: 'none' });
    const m = { atk: s.atk, baseAcc: s.baseAcc, def: s.def, tier, level: L };
    const main = at(L, 1), def = at(L, 2), acc = at(L, 3);
    const defScore = s.def * (C.ACC_DEF_MUL[tier] || 1);
    const today = (sk) => Math.max(0.15, Math.min(0.95, 0.55 + (sk + acc - defScore) * 0.01));
    const ward = 2 * (1 - HERO_HIT) * (main + acc + BASE);
    const rh = (sk) => ratio(sk + acc + BASE, ward);
    const mt = (d) => C.monsterAccuracy(m, d);
    const hit0 = Math.max(0.05, Math.min(0.95, MHIT === null ? s.baseAcc + (s.atk - L) * 0.02 : MHIT));
    const aim = hit0 >= 0.5 ? (def + BASE) / (2 * (1 - hit0)) : 2 * hit0 * (def + BASE);
    const mr = (d) => ratio(aim, d + BASE);
    const cost = ref.XP.skillXpForLevel('melee', Math.round(main) + 10) - ref.XP.skillXpForLevel('melee', Math.round(main));
    console.log([L, Math.round(main) + ' / ' + Math.round(def) + ' / ' + acc, s.atk + ', ' + s.def + ', ' + p(hit0),
      p(today(main)) + ' / ' + p(today(main - 9)), p(rh(main)) + ' / ' + p(rh(main - 9)),
      p(mt(def)) + ' / ' + p(mt(def - 9)) + ' / ' + p(mt(15)), p(mr(def)) + ' / ' + p(mr(def - 9)) + ' / ' + p(mr(15)),
      ((today(main + 10) - today(main)) * 100).toFixed(1) + ' / ' + ((rh(main + 10) - rh(main)) * 100).toFixed(1),
      ((mt(def + 10) / mt(def) - 1) * 100).toFixed(1) + '% / ' + ((mr(def + 10) / mr(def) - 1) * 100).toFixed(1) + '%',
      cost.toLocaleString('en-US')].join(' | '));
  }
}

/* ── play: today's engine and the planted ratio, the same cells and seeds ──────────────────────────────────────────────────────── */
function refCell(R, point, seat, hours, seeds) {
  const cell = { id: ['REF', point.id, seat.id].join(':'), ground: point.ground, party: seat.party, level: point.level, hours, seeds, profile: 'played',
    ...(point.open ? {} : { gear: { uniques: true, openAlso: [point.ground] } }) };
  let tier = 'normal';
  if (seat.tier === 'hardest') { const ts = R.tiers.tiersOf(point.ground); tier = ts.includes('deadly') ? 'deadly' : ts.includes('dangerous') ? 'dangerous' : 'normal'; }
  if (arg('tier')) tier = arg('tier');
  if (tier !== 'normal') { cell.options = { tier }; const pull = R.tiers.pullOfTier(R.tiers.tierRowOf(point.ground, tier), seat.party.length); if (pull) cell.density = pull; }
  if (arg('level')) cell.level = Number(arg('level'));
  if (arg('bump')) {
    const n = Number(arg('bump')), lines = loadLines();
    cell.skillsBySeat = seat.party.map((style) => { const lv = skillsAt(lines, seat.party.length > 1 ? 'party' : 'alone', style, cell.level), main = MAIN[style] || 'melee';
      return Object.fromEntries(['melee', 'ranged', 'magic', 'defense'].map((k) => [k, k === main || k === 'defense' ? lv[k] + n : lv[k]])); });
  }
  return { cell, tier };
}
function rowOf(m, party) {
  const hs = m.heroes;
  return { xp: Math.round(mean(hs.map((h) => h.levelXpPerH))), skill: Math.round(mean(hs.map((h, i) => (h.skillXpPerH || {})[MAIN[party[i]] || 'melee'] || 0))),
    taken: Math.round(mean(hs.map((h) => h.takenPerH))), frontTaken: Math.round(hs[0].takenPerH), store: Math.round(mean(hs.map((h) => h.storePerH))), net: Math.round(mean(hs.map((h) => h.profitPerH))),
    deaths: hs.reduce((n, h) => n + h.deaths, 0), low: Math.min(...hs.map((h) => (h.encMinHpPct || {}).p10 ?? 100)) };
}
async function play() {
  const { plant } = await import(u('tests/hunt-core/fixtures/h1.js'));
  const { PLAY_TREES } = await import(u('tests/hunt-core/fixtures/play-ground.mjs'));
  const BS = await import(u('src/data/balance-sheet.js'));
  const RBASE = await loadCellRunner(ROOT);
  const ref = await referenceTable(RBASE.gear);
  const ids = String(arg('at', REF_POINTS.map((p) => p.id).join(','))).split(',');
  const points = ids.map((id) => REF_POINTS.find((p) => p.id === id) || { id, ground: id, level: Number(arg('level', 0)) || bad('a ground that is not a reference point needs --level'), open: true });
  const seat = REF_SEATS.find((q) => q.id === arg('seat', 'lone')) || bad('no such seat ' + arg('seat'));
  const hours = Number(arg('hours', 1)), seeds = Number(arg('seeds', 2));
  const plants = [];
  const planted = async (e) => { const q = plant(e, [...PLAY_TREES, 'tests/hunt-core/fixtures']); plants.push(q); return loadCellRunner(q.root); };
  const p = { done: () => plants.forEach((q) => q.done()) };
  try {
    const R0 = ENGINES === 'ratio' ? null : dialEdits().length ? await planted(dialEdits()) : RBASE;
    const R1 = ENGINES === 'today' ? null : await planted([...edits(ref), ...dialEdits()]);
    const RT = R0 || R1;
    console.log('PLAY: base rating ' + BASE + ', seat ' + seat.id + ', ' + seeds + ' seeds x ' + hours + ' h, paired dice. hero-hit ' + HERO_HIT + ', monster hit ' + (MHIT === null ? "the row's own" : MHIT) + ', blow x' + BLOW + (arg('level') ? ', hero Level ' + arg('level') : '') + (arg('bump') ? ', skills +' + arg('bump') : '') + '. An hour, a head.');
    console.log('point | tier | engine | Level XP | x contract at the hero Level | main skill XP | damage taken (a head) | front seat taken | store bill | net gold | deaths | low HP p10 %');
    for (const pt of points) {
      const { cell, tier } = refCell(RT, pt, seat, hours, seeds);
      const c = BS.contractXpPerH(cell.level);
      for (const [name, R] of [['today', R0], ['ratio', R1]].filter((e) => e[1])) {
        let r;
        try { r = rowOf(R.runCell({ ...cell }), seat.party); } catch (e) { console.log([pt.id, tier, name, 'ERROR ' + e.message].join(' | ')); continue; }
        console.log([pt.id + ' L' + cell.level, tier + (DEADLY_DMG ? ' deadly ' + DEADLY_DMG : '') + (DANGEROUS_DMG ? ' dangerous ' + DANGEROUS_DMG : ''), name, r.xp, (r.xp / c).toFixed(2), r.skill, r.taken, r.frontTaken, r.store, r.net, r.deaths, r.low].join(' | '));
      }
    }
  } finally { p.done(); }
}

if (mode === 'formula') await formula();
else if (mode === 'play') await play();
else bad('usage: tohit-ratio.mjs formula | play [--at ...] [--seat lone|mage|four] [--hours 1] [--seeds 2] [--level N] [--hero-hit 0.85] [--mhit 0.70] [--blow 1.0] [--bump N]');
