#!/usr/bin/env node
// tools/balance-sim/staged/luck-measure.mjs — LUCK (staged/luck.js) MEASURED ON PLAYED LIVES, ON THE REAL ENGINE
// (designer, 2026-11-19). A measuring tool for a proposal: it grades nothing and writes nothing under src/.
//
//   node tools/balance-sim/staged/luck-measure.mjs curve
//        the ladder and the formula: the bonus at each Luck, and what today's open grounds can hold
//   node tools/balance-sim/staged/luck-measure.mjs life --party hammer [--policy rec] [--max 500] [--luck on|off] [--out file.json]
//        a played life (the loop of tools/balance-sim/life.mjs: the advised ground, the played profile, store supplies), hour by hour.
//        Kill counters are carried the way the Bestiary counts them (every kill, for each hero there), Luck is read from them before
//        each chunk, and with `--luck on` the bonus is APPLIED IN THE ROLL: every Rare and Trophy row's chance on the engine's own
//        monster rows is multiplied for that chunk and put back after it. `--luck off` plays today's game on the same dice.
//   node tools/balance-sim/staged/luck-measure.mjs compare --off a.json --on b.json
//        the table: Level, Luck, bonus, Rares an hour and gold an hour at 10 / 100 / 500 hunted hours, today against Luck
//
// TWO READINGS OF A RARE RATE, both printed. EXPECTED: the chunk's measured kills by creature x each Rare or Trophy row's chance
// (drops.js effectiveDropChance, the game's own): exact for those kills, no dice noise. ROLLED: the `rare_drop` hints the settle
// answered. For a lone hero the two runs are the same dice (a kill's loot draws don't move with a row's chance), so every Rare the
// `off` life rolled the `on` life rolled too.
//
// Exit 0 when it ran, 2 on a bad argument.
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCellRunner } from '../cell.mjs';
import { sourceQuery } from '../../lib/version-stamp.mjs';
import { LUCK_STAGES, LUCK_CAP_PM, LUCK_HALF, LUCK_BANDS, luckOf, luckPm, luckMult, stagesAt } from './luck.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];
if (!['curve', 'life', 'compare'].includes(mode)) { console.error('usage: luck-measure.mjs curve | life --party <styles> [--policy rec|deadly|dangerous] [--max h] [--luck on|off] [--out f] | compare --off a.json --on b.json'); process.exit(2); }

const MARKS = [10, 100, 500];
const pct = (pm) => (pm / 10).toFixed(1) + '%';

if (mode === 'compare') {
  const off = JSON.parse(readFileSync(resolve(arg('off')), 'utf8')), on = JSON.parse(readFileSync(resolve(arg('on')), 'utf8'));
  const n = on.party.length;
  /* the hours around a mark: its last tenth, at least 5 hours (one ground's stretch, so the rate is that ground's) */
  const win = (tr, at) => tr.filter((t) => t.hours > at - Math.max(5, at / 10) && t.hours <= at + 1e-9);
  const sum = (rows, f) => rows.reduce((s, t) => s + f(t), 0);
  console.log(`${on.party.join('+')} (${on.policy}), a hero's share. Expected = measured kills x the row's chance. Rolled = what the settle dropped.`);
  console.log('hours | Level | ground | Luck | bonus | Rares an hour today -> with Luck (expected) | hours a Rare today -> with Luck | rolled Rares so far today -> with Luck | expected so far | coin and sold loot an hour | Rares\' shop value an hour today -> with Luck');
  for (const at of MARKS) {
    const a = win(off.trace, at), b = win(on.trace, at);
    if (!b.length || b[b.length - 1].hours < at - 1) { console.log(`${at} | not reached (${on.hours.toFixed(0)} h played)`); continue; }
    const H = sum(b, (t) => t.h), last = b[b.length - 1];
    const e0 = sum(b, (t) => t.expBase) / H / n, e1 = sum(b, (t) => t.expLuck) / H / n;
    const upTo = (tr, f) => sum(tr.filter((t) => t.hours <= at + 1e-9), f) / n;
    const inc = sum(b, (t) => t.income) / H / n, rv0 = sum(a, (t) => t.rareGold) / sum(a, (t) => t.h) / n, rv1 = sum(b, (t) => t.rareGold) / H / n;
    console.log(`${at} | ${Math.min(...last.levels)} | ${last.ground}${last.tier === 'normal' ? '' : ' (' + last.tier + ')'} | ${last.luck} | +${pct(last.pm)} | ${e0.toFixed(3)} -> ${e1.toFixed(3)} | ${(1 / e0).toFixed(1)} h -> ${(1 / e1).toFixed(1)} h | ${upTo(off.trace, (t) => t.rolled).toFixed(1)} -> ${upTo(on.trace, (t) => t.rolled).toFixed(1)} | ${upTo(on.trace, (t) => t.expBase).toFixed(1)} -> ${upTo(on.trace, (t) => t.expLuck).toFixed(1)} | ${Math.round(inc)} | ${Math.round(rv0)} -> ${Math.round(rv1)} (window, rolled)`);
  }
  const tot = (tr, f) => sum(tr, f) / n;
  console.log(`whole life, a hero: income ${Math.round(tot(off.trace, (t) => t.income))} today, ${Math.round(tot(on.trace, (t) => t.income))} with Luck (coin and every band but Rare and Trophy: must be equal); Rares' shop value ${Math.round(tot(off.trace, (t) => t.rareGold))} -> ${Math.round(tot(on.trace, (t) => t.rareGold))}; Level at the end ${off.reached.join('/')} -> ${on.reached.join('/')} (must be equal)`);
  console.log('Luck milestones (hunted hours): ' + [5, 10, 25, 50, 75, 100, 150, 200].map((L) => { const t = on.trace.find((x) => x.luckAfter >= L); return `${L}: ${t ? t.hours.toFixed(0) + ' h' : 'not reached'}`; }).join(' · '));
  process.exit(0);
}

const R = await loadCellRunner(ROOT), XP = R.XP;
const v = sourceQuery(ROOT);
const G = await import(u('src/data/hunt-grounds.js'));
const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
const T = await import(u('src/data/hunt-tiers.js'));
const { recommendedHunt } = await import(u('src/shell/hunt-list.js') + v);
const { effectiveDropChance } = await import(u('src/core/drops.js') + v);
/* every instance of the monster rows the engine may read (the stamped one and the bare one: worker.mjs ENG.monsters) */
const TABLES = [...new Set([(await import(u('src/data/monsters.js') + v)).MONSTERS, (await import(u('src/data/monsters.js'))).MONSTERS])];
const MON = TABLES[0];
const huntOf = (g) => HUNT_INDEX[G.HUNT_GROUNDS[g].hunt || g];
const OPEN = (Array.isArray(G.OPEN_GROUNDS) ? G.OPEN_GROUNDS : Object.keys(G.OPEN_GROUNDS)).filter((g) => !huntOf(g).staged);
const monstersOf = (g) => { const s = new Set(); for (const p of G.HUNT_GROUNDS[g].pockets) for (const x of (p.pack || []).concat(p.spawns)) s.add(x.monster); return [...s]; };
const ROSTER = [...new Set(OPEN.flatMap(monstersOf))];
const revealRows = (id) => ((MON[id] || {}).drops || []).filter((d) => LUCK_BANDS.includes(d.band));

if (mode === 'curve') {
  console.log(`stages (kills against one creature, +1 Luck each): ${LUCK_STAGES.join(' / ')}`);
  console.log(`bonus = floor(${LUCK_CAP_PM} x Luck / (Luck + ${LUCK_HALF})) permille, on ${LUCK_BANDS.join(' and ')} rows only`);
  console.log(`open grounds: ${OPEN.length}, creatures on them: ${ROSTER.length}, Luck they can hold: ${ROSTER.length * LUCK_STAGES.length} (+${pct(luckPm(ROSTER.length * LUCK_STAGES.length))})`);
  console.log('Luck | bonus | a 10 h Rare comes every | a 125 h Trophy comes every');
  for (const L of [0, 1, 5, 10, 25, 50, 75, 100, 150, 200, 312, 500, 1000, 5000]) console.log(`${L} | +${pct(luckPm(L))} | ${(10 / luckMult(L)).toFixed(1)} h | ${(125 / luckMult(L)).toFixed(0)} h`);
  console.log(`creatures with a Rare or Trophy row: ${ROSTER.filter((id) => revealRows(id).length).length} of ${ROSTER.length}; rows: ${ROSTER.reduce((s, id) => s + revealRows(id).length, 0)}`);
  process.exit(0);
}

/* ---- life ---- */
const POLICIES = ['rec', 'dangerous', 'deadly'];
const policy = arg('policy', 'rec'), party = String(arg('party', '')).split(',').filter(Boolean), maxHours = Number(arg('max', 500)), luckOn = arg('luck', 'on') === 'on';
if (!party.length || !POLICIES.includes(policy) || !(maxHours > 0)) { console.error('luck-measure life: --party <styles> [--policy ' + POLICIES.join('|') + '] [--max hours] [--luck on|off]'); process.exit(2); }
const floorOf = (g) => huntOf(g).band[0];

/* THE ROLL: every Rare and Trophy row's chance x `mult` on the engine's own rows; answers the undo */
function applyLuck(mult) {
  const undo = new Map();
  /* the two instances may share their row objects: each row is multiplied once, and put back to the chance it had */
  for (const M of TABLES) for (const id of Object.keys(M)) for (const d of M[id].drops || []) {
    if (undo.has(d) || !LUCK_BANDS.includes(d.band) || !(d.ch < 1)) continue;
    undo.set(d, d.ch);
    d.ch = d.ch * mult;
  }
  return () => { for (const [d, ch] of undo) d.ch = ch; };
}
/* the expected Rare and Trophy drops of `kills` { creature: n } at multiplier `mult`, by the game's own chance function */
function expected(kills, mult) {
  let e = 0;
  for (const [id, n] of Object.entries(kills)) {
    const dropMult = Number((MON[id] || {}).dropBonus) > 0 ? Number(MON[id].dropBonus) : 1;
    for (const d of revealRows(id)) e += n * Math.min(0.95, effectiveDropChance(d, { dropMult }) * mult);
  }
  return e;
}

const seats = party.map(() => ({ levelXp: 0, skills: {} }));
const lv = (s) => XP.charLevelFromXp(s.levelXp);
const counters = {}, trace = [];
let hours = 0, chunk = 0;
while (hours < maxHours) {
  const levels = seats.map(lv), L = Math.min(...levels);
  const chunkH = L < 8 ? 0.25 : L < 12 ? 0.5 : 1;
  const ground = recommendedHunt(levels, party.length).hunt;
  let tier = 'normal';
  if (policy === 'deadly') { const ts = T.tiersOf(ground); tier = ts[ts.length - 1]; }
  if (policy === 'dangerous' && T.tiersOf(ground).includes('dangerous') && L >= floorOf(ground)) tier = 'dangerous';
  const pull = tier === 'normal' ? null : T.pullOfTier(T.tierRowOf(ground, tier), party.length);
  const cell = { id: 'luck:' + chunk, ground, party, startBySeat: seats.map((s) => ({ levelXp: s.levelXp, skills: { ...s.skills } })), hours: chunkH, seeds: 1,
    seedBase: 7000 + chunk, segmentH: chunkH, windowMs: 600000, supply: 'store', profile: 'played',
    ...(tier === 'normal' ? {} : { options: { tier } }), ...(pull ? { density: pull } : {}) };
  const luck = luckOf(counters, ROSTER), pm = luckPm(luck), mult = luckMult(luck);
  const undo = luckOn ? applyLuck(mult) : () => {};
  let m;
  try { m = R.runCell(cell); } finally { undo(); }
  const h = m.party.hours;
  m.heroes.forEach((x, i) => {
    const s = seats[i];
    s.levelXp = Math.max(XP.charXpForLevel(lv(s)), s.levelXp + x.raw.levelXp - x.raw.xpLostLevel);
    for (const k of Object.keys({ ...x.raw.skillXp, ...x.raw.xpLostSkill })) s.skills[k] = Math.max(0, (s.skills[k] || 0) + (x.raw.skillXp[k] || 0) - (x.raw.xpLostSkill[k] || 0));
  });
  /* the chunk's kills by creature (the cell answers them per hour): the Bestiary's count for each hero there */
  const kills = Object.fromEntries(Object.entries(m.party.killsByPerH).map(([id, perH]) => [id, Math.round(perH * h)]));
  for (const [id, n] of Object.entries(kills)) counters[id] = (counters[id] || 0) + n;
  hours += h;
  trace.push({ chunk, h, hours: Math.round(hours * 100) / 100, ground, tier, levels, luck, pm, luckAfter: luckOf(counters, ROSTER), kills: m.party.killsPerH * h,
    expBase: expected(kills, 1), expLuck: expected(kills, mult), rolled: m.heroes.reduce((s, x) => s + x.rareItems, 0),
    income: m.heroes.reduce((s, x) => s + x.raw.income, 0), store: m.heroes.reduce((s, x) => s + x.raw.store, 0), rareGold: m.heroes.reduce((s, x) => s + x.raw.rares, 0),
    deaths: m.heroes.reduce((s, x) => s + x.deaths, 0) });
  chunk++;
}

const n = party.length, sum = (f) => trace.reduce((s, t) => s + f(t), 0);
console.log(`${party.join('+')} (${policy}, played, Luck ${luckOn ? 'ON in the roll' : 'off: today'}): ${hours.toFixed(1)} h -> Level ${seats.map(lv).join('/')}, Luck ${luckOf(counters, ROSTER)} of ${ROSTER.length * LUCK_STAGES.length} (+${pct(luckPm(luckOf(counters, ROSTER)))})`);
console.log(`  a hero: rolled Rares ${(sum((t) => t.rolled) / n).toFixed(1)}, expected today ${(sum((t) => t.expBase) / n).toFixed(1)}, expected with Luck ${(sum((t) => t.expLuck) / n).toFixed(1)}; income ${Math.round(sum((t) => t.income) / n)}, Rares' shop value ${Math.round(sum((t) => t.rareGold) / n)}, store ${Math.round(sum((t) => t.store) / n)}, deaths ${sum((t) => t.deaths)}`);
console.log('  stages held, by creature: ' + ROSTER.map((id) => [id, stagesAt(counters[id] || 0)]).filter(([, s]) => s > 0).map(([id, s]) => `${id} ${s}`).join(', '));
for (const at of MARKS) { const t = trace.find((x) => x.hours >= at); if (t) console.log(`  ${at} h: Level ${Math.min(...t.levels)} on ${t.ground}, Luck ${t.luckAfter} (+${pct(luckPm(t.luckAfter))})`); }
if (arg('out', null)) writeFileSync(resolve(arg('out')), JSON.stringify({ policy, party, luckOn, hours, reached: seats.map(lv), trace, counters, roster: ROSTER.length, stages: LUCK_STAGES, capPm: LUCK_CAP_PM, half: LUCK_HALF }));
