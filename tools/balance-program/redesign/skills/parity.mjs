#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/skills/parity.mjs — SKILLS ON THE LEVEL CLOCK, READ OFF THE REAL ENGINE (lane/skills-time-parity, 2026-11-23).
//
//   node tools/balance-program/redesign/skills/parity.mjs [--seeds 3] [--hours 3] [--workers 4] [--skills line|level] [--json <file>]
//
// docs/design/redesign/27-formula-overhaul.md row P-3, 04-math-strategy.md section 4. A combat skill's level n costs skillPace x the hours
// Level n takes (src/data/core-model.js SKILL_CURVE, skillStepOf), counted in the reference skill XP an hour: SKILL_CURVE.xpPerHealthHour
// x the reference health of Level n (the amount pipeline's display curve, src/core/hunt/amount.js refHealth). This plays the Steady mixed
// four (hammer, bow, mage, healer; MID kits; the same path as hours/fit.mjs and v1-climb.mjs) on the ground the game sends a four to at each
// Level from 5 to 185 (a scale ground from its held start), and reads, per seat:
//   rate     the seat's skill XP a hunted hour in its main skill (Melee, Ranged, Magic) and the hammer's Defense
//   K        rate / refHealth(L): the reference skill XP an hour per point of reference health, the curve's one measured constant
// then walks a hero at the reference pace (Level L at hoursToLevel(L), the hours formula) and reports the hours to each skill milestone on
// the curve this tree carries and on the retired geometric one (15 x s^2 x 1.04^(s-1)), at the measured rates, so the before and after
// read the same pay.
//   --skills line    the cell's skills from the career lines (tools/balance-sim/skill-lines.json, what the harness plays by default)
//   --skills level   every seat's skills at its Level: the specialist time parity makes (skillPace 1)
//
// Exit 0 ran (tables printed, never a verdict) · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fork } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const SEEDS = Number(arg('seeds', 3)), HOURS = Number(arg('hours', 3)), WORKERS = Number(arg('workers', 4)), SKILLS = arg('skills', 'line');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { loadGridData, buildCell } = await imp('tools/balance-program/progression-grid.mjs');
const { loadKits } = await imp('tools/balance-program/grid-kit.mjs');
const { heldStart } = await imp('tools/balance-program/redesign/held-four.mjs');
const { DANGER_GROUNDS } = await imp('src/data/danger.js');
const { refHealth } = await imp('src/core/hunt/amount.js');
const CM = await imp('src/data/core-model.js');
const XP = await imp('src/core/xp.js');

/* the cells read, Level or ground:Level, in rising Level: the first hours, each early ground, the two scale bands at their reference Levels
   (src/data/danger.js refLevel), the off-scale middle and the Catacomb wings. A bare Level plays the ground the game sends a four to. */
const SPECS = (arg('cells', '5,10,15,25,40,hasks_ford:52,muster_barrows:60,muster_barrows:70,80,100,120,135,catacomb_bone_wing:175')).split(',')
  .map((x) => { const [g, l] = x.includes(':') ? x.split(':') : [null, x]; return { L: Number(l), ground: g }; });
const MIXED = ['hammer', 'bow', 'mage', 'healer'];
const MAIN = { hammer: 'melee', bow: 'ranged', mage: 'magic', healer: 'magic' };

function pool(jobs, n) {
  const queue = jobs.slice(), out = {}, errors = [];
  return new Promise((finish) => {
    let alive = Math.max(1, Math.min(n, queue.length));
    for (let i = 0, k = alive; i < k; i++) {
      const w = fork(join(ROOT, 'tools', 'balance-sim', 'worker.mjs'), [ROOT], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      const feed = () => { const j = queue.shift(); if (!j) { w.kill(); return; } w.cur = j; w.send({ type: 'job', job: j.job }); };
      w.on('message', (m) => {
        if (m.type === 'ready') { feed(); return; }
        if (m.type === 'done') out[w.cur.key] = m.result; else errors.push(`${w.cur.key}: ${String(m.error).split('\n')[0]}`);
        w.cur = null; feed();
      });
      w.on('exit', () => { if (w.cur) errors.push(`${w.cur.key}: the worker exited`); if (--alive === 0) finish({ out, errors }); });
    }
  });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
/* --from <json>: read the rows a run wrote (no play), to walk them on this tree's curve */
let rows;
if (arg('from')) rows = JSON.parse(readFileSync(resolve(arg('from')), 'utf8')).rows;
else {
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const cells = [], jobs = [];
  for (const [ci, spec] of SPECS.entries()) {
    const L = spec.L, ground = spec.ground || D.groundAt(L, 4);
    const b = buildCell(D, K, { L, gear: 'mid', styles: MIXED, tier: 'normal', ground });
    const scale = Object.prototype.hasOwnProperty.call(DANGER_GROUNDS, ground);
    const skillsBySeat = SKILLS === 'level' ? MIXED.map(() => ({ melee: L, ranged: L, magic: L, defense: L })) : b.cell.skillsBySeat;
    const cell = { ...b.cell, skillsBySeat, ...(scale ? { options: { ...(b.cell.options || {}), risk: 'steady', danger: await heldStart(ROOT, ground) } } : {}), hours: HOURS, seeds: 1 };
    cells.push({ ci, L, ground, scale, skillsBySeat });
    for (let s = 0; s < SEEDS; s++) jobs.push({ key: `${ci}#${s}`, job: { ...cell, id: `PARITY:${ground}:${L}#${s}`, seedBase: 1000 + s } });
  }
  const t0 = Date.now();
  const { out, errors } = await pool(jobs, WORKERS);
  if (errors.length) { console.error('parity: the simulator failed:\n  ' + errors.join('\n  ')); process.exit(2); }
  rows = cells.map((c) => {
    const seeds = Array.from({ length: SEEDS }, (_, s) => out[`${c.ci}#${s}`]);
    const seat = (i, k) => mean(seeds.map((r) => (r.heroes[i].skillXpPerH || {})[k] || 0));
    const H = refHealth(c.L);
    const main = MIXED.map((st, i) => ({ style: st, skill: MAIN[st], at: c.skillsBySeat[i][MAIN[st]], rate: Math.round(seat(i, MAIN[st])) }));
    const def = { at: c.skillsBySeat[0].defense, rate: Math.round(seat(0, 'defense')) };
    return { L: c.L, ground: c.ground, scale: c.scale, refHealth: H, main: main.map((m) => ({ ...m, k: Math.round((m.rate / H) * 10) / 10 })),
      defense: { ...def, k: Math.round((def.rate / H) * 10) / 10 }, levelXpPerHeroH: Math.round(mean(seeds.map((r) => r.party.levelXpPerHeroPerH))) };
  });
  console.log(`(played in ${Math.round((Date.now() - t0) / 1000)} s)`);
}

console.log(`SKILL XP AN HOUR, the Steady mixed four (MID kits), ${SEEDS} seeds x ${HOURS} h a cell, skills ${SKILLS}; K = rate / refHealth(L)`);
console.log('   L ground                  hammer melee (K)      bow ranged (K)       mage magic (K)       healer magic (K)     hammer defense (K)');
for (const r of rows) {
  const f = (m) => `${String(m.at).padStart(4)}: ${String(m.rate).padStart(7)} (${m.k.toFixed(1).padStart(5)})`;
  console.log(`${String(r.L).padStart(4)} ${(r.ground + (r.scale ? '*' : '')).padEnd(23)} ${r.main.map(f).join('  ')}  ${f(r.defense)}`);
}
const ks = rows.filter((r) => r.scale).map((r) => r.main.filter((m) => m.style === 'hammer' || m.style === 'bow').map((m) => m.k)).flat();
if (ks.length) console.log(`(* a scale ground from its held start. Its damage dealers' K: mean ${mean(ks).toFixed(1)}, min ${Math.min(...ks)}, max ${Math.max(...ks)}; the curve counts in ${CM.SKILL_CURVE.xpPerHealthHour})`);

/* ── THE HOURS TO EACH MILESTONE, a hero at the reference pace earning the measured rate of its Level (straight between the Levels read) ── */
const kAt = (L, pick) => {
  const pts = rows.map((r) => [r.L, pick(r)]);
  if (L <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (L <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (L - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
  return pts[pts.length - 1][1];
};
/* the retired curve is the geometric one Inner Flame keeps (core-model.js FLAME_SKILL_CURVE), read through the one walk */
const curves = { retired: (s) => XP.skillXpForLevel(CM.FLAME_SKILL_CURVE.skill, s), 'this tree': (s) => XP.skillXpForLevel('melee', s) };
const MILESTONES = [10, 30, 60, 100, 150, 200];
/* walk the Level clock in tenths of an hour: Level from the hours formula, skill XP at K(Level) x refHealth(Level); each skill milestone's
   hours (and the Level then), and the skill at each Level milestone */
function walk(curve, kOf) {
  const at = {}, lv = {}, step = 0.1, top = MILESTONES[MILESTONES.length - 1];
  let h = 0, L = 1, toNext = CM.levelHoursOf(1), xp = 0, s = 1;
  while ((s <= top || L <= top) && h < 40000) {
    xp += kOf(L) * refHealth(L) * step;
    h += step; toNext -= step;
    while (toNext <= 0) { L += 1; toNext += CM.levelHoursOf(L); if (MILESTONES.includes(L)) lv[L] = s; }
    while (curve(s + 1) <= xp && s < 5000) { s += 1; if (MILESTONES.includes(s)) at[s] = { h: Math.round(h * 10) / 10, L }; }
  }
  return { hoursTo: at, skillAt: lv };
}
const PICKS = { 'reference (the curve K)': () => CM.SKILL_CURVE.xpPerHealthHour, 'hammer Melee': (r) => r.main[0].k, 'bow Ranged': (r) => r.main[1].k,
  'mage Magic': (r) => r.main[2].k, 'healer Magic': (r) => r.main[3].k, 'hammer Defense': (r) => r.defense.k };
const walks = {};
console.log('\nHOURS TO A SKILL MILESTONE on the Level clock (hunted hours from Level 1, the Level then), at the reference rate and at each seat\'s measured rates');
console.log('seat                    curve      ' + MILESTONES.map((m) => ('skill ' + m).padStart(17)).join('') + '   | the skill at Level ' + MILESTONES.join(' / '));
for (const [name, pick] of Object.entries(PICKS)) {
  walks[name] = {};
  for (const [cn, curve] of Object.entries(curves)) {
    const w = walk(curve, (L) => kAt(L, pick));
    walks[name][cn] = w;
    console.log(`${name.padEnd(23)} ${cn.padEnd(10)} ` + MILESTONES.map((m) => (w.hoursTo[m] ? `${w.hoursTo[m].h} h (L${w.hoursTo[m].L})` : '-').padStart(17)).join('')
      + '   | ' + MILESTONES.map((m) => (w.skillAt[m] === undefined ? '-' : w.skillAt[m])).join(' / '));
  }
}
console.log('the Level clock: ' + MILESTONES.map((m) => `Level ${m} ${Math.round(CM.hoursToLevel(m) * 10) / 10} h`).join(', '));
const jsonOut = arg('json');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ when: new Date().toISOString().slice(0, 10), seeds: SEEDS, hours: HOURS, skills: SKILLS,
  curve: CM.SKILL_CURVE, rows, walks }, null, 1) + '\n');
