#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/flame-rules.mjs — THE COMPANY FLAME'S RULES, PROVEN IN NODE (lane/flame-temper-build, 2026-11-22; 21-flame-temper-imbue-loot.md
// section 1; src/data/inner-flame.js, src/core/inner-flame.js; the SQL twins are pinned by 1063-flame-temper-catalogue.generated.sql, the
// verbs and the settle's decay are run by 1063-flame-temper.sql's §7). tests/inner-flame.mjs is the shipped Hearth's guard, not this one.
//
//   node tests/flame-rules.mjs            the rules
//   node tests/flame-rules.mjs --mutate   every planted defect must turn a rule RED
//
// ci-step: economy-selftests | Company flame rules (room, luck, decay by hunted time, the burn, the stoke rule) and their SQL catalogue
// ci-run: node tests/flame-rules.mjs
// ci-run: node tools/mutant-gate.mjs node tests/flame-rules.mjs --mutate
// ci-run: node tools/gen-flame-temper.mjs --check
// ci-run: node tools/mutant-gate.mjs node tools/gen-flame-temper.mjs --selftest
//
// mutant-anchors: src/core/inner-flame.js src/data/inner-flame.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
//   FR-1  THE TABLE (21 section 1.2): Flame Level 1 / 50 / 99 burns 8 / 6 / 4% a hunted hero-hour and holds 18.75 / 25 / 37.5 points;
//         the height on own drops (one point a hero-hour) is two thirds of the room; luck there +20 / +24 / +30%, kept full +25.7 / +30 / +36%
//   FR-2  BOTH PATHS: hunted time burns the flame the same in one span as in any split into windows (the carry), and a viewed hunt and a
//         closed one are the same windows; no hunted time, no burn (town, a death); what burns is Flame XP, and the Level re-reads it
//   FR-3  THE LEVEL CURVE: rises every Level, 6,000 points at 99, each Level 1.045x the last
//   FR-4  THE BURN never passes the room, takes the most units that fit, and a far band is worth less than a near one
//   FR-5  THE STOKE RULE: an unknown keep is refused, never guessed; the limits are held to the catalogue's
//   FR-6  THE TOP RANK reads luck under its cap (D-4)
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runPureGuard } from './_pure-guard.mjs';

async function pure(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + '?t=' + Date.now());
  const [D, C] = await Promise.all([imp('src/data/inner-flame.js'), imp('src/core/inner-flame.js')]);
  const out = [];
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  for (const p of D.validateFlame()) out.push('FR-0 ' + p);
  /* FR-1 */
  const rows = [[1, 80000, 18750, 200, 257], [50, 60000, 25000, 239, 300], [99, 40000, 37500, 300, 360]];
  for (const [fl, d, room, own, full] of rows) {
    if (C.decayPpm(fl) !== d) out.push('FR-1 Flame Level ' + fl + ' burns ' + C.decayPpm(fl) + ' ppm, want ' + d);
    if (C.roomMpts(fl) !== room) out.push('FR-1 Flame Level ' + fl + ' holds ' + C.roomMpts(fl) + ', want ' + room);
    const steady = Math.floor(1e9 / C.decayPpm(fl));
    if (!near(steady * 1.5, C.roomMpts(fl), 2)) out.push('FR-1 the own-drops height at ' + fl + ' is not two thirds of the room');
    if (C.luckPm(steady) !== own || C.luckPm(C.roomMpts(fl)) !== full) out.push('FR-1 luck at ' + fl + ' is ' + C.luckPm(steady) + ' / ' + C.luckPm(C.roomMpts(fl)) + ', want ' + own + ' / ' + full);
  }
  /* own drops reach the steady height: a point (1000 milli-points) a hero-hour against the decay */
  let f = { height: 0, points: 0, carryMs: 0 };
  for (let h = 0; h < 200; h++) { f = C.decay(f, 3600000); f.height += 1000; }
  /* the Level rises as it burns, so the steady height is 1 / decay at the Level it reached (fed once an hour: up to 4% over, the minute's compounding) */
  const want = 1e9 / C.decayPpm(C.levelOf(f.points));
  if (!(f.height >= want - 50 && f.height <= want * 1.04)) out.push('FR-1 a fire fed its own point an hour settles at ' + f.height + ', want about ' + Math.round(want));
  /* FR-2 */
  const one = C.decay({ height: 18750, points: 0, carryMs: 0 }, 4 * 3600000);
  let split = { height: 18750, points: 0, carryMs: 0 };
  for (const ms of [10000, 25000, 59999, 1, 3600000, 7000000, 4 * 3600000 - 10000 - 25000 - 59999 - 1 - 3600000 - 7000000]) split = C.decay(split, ms);
  if (one.height !== split.height || one.points !== split.points || one.carryMs !== split.carryMs) out.push('FR-2 one span and its windows burn differently: ' + JSON.stringify([one, split]));
  if (C.decay({ height: 5000, points: 7, carryMs: 0 }, 0).height !== 5000) out.push('FR-2 no hunted time burned the flame');
  if (one.burned !== one.points || one.burned <= 0 || one.height + one.burned !== 18750) out.push('FR-2 what burns is not Flame XP: ' + JSON.stringify(one));
  const lv = C.decay({ height: 37000, points: D.FLAME_LEVELS[48] - 5, carryMs: 0 }, 3600000);
  if (lv.level !== C.levelOf(lv.points) || lv.level < 49) out.push('FR-2 the Level is not re-read as it burns: ' + JSON.stringify(lv));
  /* FR-3 */
  const L = D.FLAME_LEVELS;
  if (L[0] !== 0 || L[98] !== 6000000 || C.levelOf(6000000) !== 99 || C.levelOf(5999999) !== 98 || C.levelOf(0) !== 1) out.push('FR-3 the curve does not run 0 to 6,000 points at 99');
  for (let i = 2; i < 98; i++) if (!near((L[i + 1] - L[i]) / (L[i] - L[i - 1]), 1.045, 0.002)) { out.push('FR-3 Level ' + (i + 1) + ' is not 1.045x the last'); break; }
  /* FR-4 */
  const b = C.burn(12000, 1, 100000, 55, 55);
  if (!(b.height <= C.roomMpts(1) && b.height > C.roomMpts(1) - 10 && b.units < 100000)) out.push('FR-4 a burn of plenty did not stop at the room: ' + JSON.stringify(b));
  if (C.fuelWorthMpts(b.units + 1, 55, 55) <= C.roomMpts(1) - 12000) out.push('FR-4 the burn left a unit that would have fit');
  if (C.burn(C.roomMpts(1), 1, 10, 55, 55).units !== 0) out.push('FR-4 a full fire took fuel');
  if (C.fuelWorthMpts(1, 55, 55) !== 10 || C.fuelWorthMpts(100, 1, 400) >= C.fuelWorthMpts(100, 300, 400) || C.fuelWorthMpts(0, 55, 55) !== 0) out.push('FR-4 worth by band is wrong');
  if (!D.FLAME_FUEL.length || !D.FLAME_FUEL.every((r) => r.band >= 45)) out.push('FR-4 a Remains good has no scale band');
  /* FR-5 */
  if (C.clampStoke({ keep: 'hot' }) !== null || C.clampStoke(null) !== null) out.push('FR-5 an unknown keep was guessed');
  const s = C.clampStoke({ keep: 'two_thirds', buy_per_day: 1e9, cap_hours_pm: -4 });
  if (!s || s.buy_per_day !== D.FLAME.stokeBuyMax || s.cap_hours_pm !== 0 || s.own_first !== true) out.push('FR-5 the limits were not clamped: ' + JSON.stringify(s));
  /* FR-6 */
  if (C.topRankPmOf(0) !== D.FLAME.topRankPm || C.topRankPmOf(360) !== 680 || C.topRankPmOf(100000) !== D.FLAME.topRankMaxPm) out.push('FR-6 the top rank does not read luck under its cap');
  return out;
}

const MUTANTS = [
  ['the burn ignores the Level', 'src/core/inner-flame.js', 'const lost = Math.floor((h * decayPpm(L) + (60 * 1000000 - 1)) / (60 * 1000000));', 'const lost = Math.floor((h * decayPpm(1) + (60 * 1000000 - 1)) / (60 * 1000000));'],
  ['the part of a minute is dropped', 'src/core/inner-flame.js', 'carryMs: total % MINUTE_MS', 'carryMs: 0'],
  ['what burns is not Flame XP', 'src/core/inner-flame.js', 'h -= lost; p += lost;', 'h -= lost;'],
  ['the room is the own-drops height', 'src/core/inner-flame.js', 'return Math.floor((FLAME.coverPm * 1000000) / decayPpm(fl));', 'return Math.floor((1000 * 1000000) / decayPpm(fl));'],
  ['luck is linear', 'src/core/inner-flame.js', 'return Math.floor((FLAME.luckMaxPm * h) / (h + FLAME.luckHalfMpts));', 'return Math.min(FLAME.luckMaxPm, Math.floor(h / 50));'],
  ['the burn passes the room', 'src/core/inner-flame.js', 'if (fuelWorthMpts(want, band, top) <= space)', 'if (true)'],
  ['every band is worth the same', 'src/core/inner-flame.js', 'const gap = Math.max(0, toInt(top) - toInt(band));', 'const gap = 0;'],
  ['an unknown keep is guessed full', 'src/core/inner-flame.js', "Object.prototype.hasOwnProperty.call(FLAME.stokeKeeps, r.keep) ? r.keep : null;", "Object.prototype.hasOwnProperty.call(FLAME.stokeKeeps, r.keep) ? r.keep : 'full';"],
  ['the top rank has no cap', 'src/core/inner-flame.js', 'return Math.min(FLAME.topRankMaxPm, Math.floor((FLAME.topRankPm * (1000 + l)) / 1000));', 'return Math.floor((FLAME.topRankPm * (1000 + l)) / 1000);'],
  ['the curve is flat', 'src/data/inner-flame.js', '  curvePm: 1045,', '  curvePm: 1001,'],
];

process.exitCode = await runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/flame-rules.mjs', pure, mutants: MUTANTS,
  green: 'room, luck, hunted-time decay (both paths), the curve, the burn, the stoke rule and the top rank all hold' });
