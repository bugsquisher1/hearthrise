#!/usr/bin/env node
// tools/balance-sim/staged/luck-measure.mjs — LUCK (staged/luck.js) MEASURED ON PLAYED LIVES, ON THE REAL ENGINE
// (designer, 2026-11-19; revised 2026-11-20 for Tyler's rulings: the Bestiary counts per account, and salvaging feeds Luck too).
// A measuring tool for a proposal: it grades nothing and writes nothing under src/.
//
//   node tools/balance-sim/staged/luck-measure.mjs curve
//        the two feeds and the formula: the bonus at each Luck, what today's open grounds can hold, what a salvage point costs
//   node tools/balance-sim/staged/luck-measure.mjs life --party hammer [--policy rec|dangerous|deadly] [--max 500] [--heroes 1]
//                                                       [--luck off|kills|all] --out file.json
//        a played life (the loop of tools/balance-sim/life.mjs: the advised ground, the played profile, store supplies), hour by hour.
//        Each chunk records its kills by creature and the worn gear those kills drop (the shop's own price for it). The ACCOUNT's
//        count is every kill once, whoever of its heroes was there: `--party a,b,c,d` is four of one account's heroes in one hunt
//        (a kill counts once); `--heroes 4` is that many of its heroes hunting apart at once, each living this same life (every
//        count and every salvaged piece times 4 for each hour a hero hunts).
//        `--luck kills` applies the Bestiary's Luck IN THE ROLL, `--luck all` the Bestiary's and the salvage of every dropped piece:
//        every Rare and Trophy row's chance on the engine's own monster rows is multiplied for the chunk and put back after it.
//        `--luck off` plays today's game on the same dice.
//   node tools/balance-sim/staged/luck-measure.mjs table --in file.json [--heroes N]
//        read off one recorded life, at 10 / 100 / 500 hours a hero: Luck from each feed, the bonus with and without salvaging,
//        Rares an hour, and the gold salvaging gives up. No play: the staged numbers can be re-read against the same life.
//   node tools/balance-sim/staged/luck-measure.mjs compare --off a.json --on b.json
//        the rolled check: Rares the settle dropped today against with Luck, and that nothing else moved
//
// TWO READINGS OF A RARE RATE. EXPECTED: the chunk's measured kills by creature x each Rare or Trophy row's chance
// (drops.js effectiveDropChance, the game's own): exact for those kills, no dice noise. ROLLED: the `rare_drop` hints the settle
// answered. For a lone hero the two runs are the same dice (a kill's loot draws don't move with a row's chance), so every Rare the
// `off` life rolled the `on` life rolled too.
// WHAT SALVAGING GIVES UP is the shop's price for the worn gear a hunt dropped (weapons, armor, off-hands, jewelry, any band),
// expected the same way. Salvage's own return (the plan's crafting stock) is not built and is counted as nothing: an upper bound.
//
// Exit 0 when it ran, 2 on a bad argument.
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LUCK_STAGES, LUCK_CAP_PM, LUCK_HALF, LUCK_BANDS, SALVAGE_STEP, luckOf, salvageLuckOf, salvageCostTo, luckPm, luckMult, stagesAt } from './luck.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];
const USAGE = 'usage: luck-measure.mjs curve | life --party <styles> [--policy rec|dangerous|deadly] [--max h] [--heroes n] [--luck off|kills|all] [--out f] | table --in f [--heroes n] | compare --off a.json --on b.json';
if (!['curve', 'life', 'table', 'compare'].includes(mode)) { console.error(USAGE); process.exit(2); }

const MARKS = [10, 100, 500];
const pct = (pm) => (pm / 10).toFixed(1) + '%';
const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1000) + 'k');
const sum = (rows, f) => rows.reduce((s, t) => s + f(t), 0);

if (mode === 'compare') {
  const off = JSON.parse(readFileSync(resolve(arg('off')), 'utf8')), on = JSON.parse(readFileSync(resolve(arg('on')), 'utf8'));
  const n = on.party.length;
  console.log(`${on.party.join('+')} (${on.policy}), a hero's share, Luck ${on.luck} in the roll against today`);
  for (const at of MARKS) {
    const upTo = (tr, f) => sum(tr.filter((t) => t.hours <= at + 1e-9), f) / n;
    console.log(`  by ${at} h: rolled Rares ${upTo(off.trace, (t) => t.rolled).toFixed(1)} -> ${upTo(on.trace, (t) => t.rolled).toFixed(1)}, expected ${upTo(on.trace, (t) => t.expBase).toFixed(1)} -> ${upTo(on.trace, (t) => t.expLuck).toFixed(1)}`);
  }
  console.log(`  whole life, a hero: income ${Math.round(sum(off.trace, (t) => t.income) / n)} today, ${Math.round(sum(on.trace, (t) => t.income) / n)} with Luck (coin and every band but Rare and Trophy); Rares' shop value ${Math.round(sum(off.trace, (t) => t.rareGold) / n)} -> ${Math.round(sum(on.trace, (t) => t.rareGold) / n)}; Level at the end ${off.reached.join('/')} -> ${on.reached.join('/')}`);
  process.exit(0);
}

/* THE ACCOUNT'S LUCK along a recorded life: `heroes` of its heroes living it apart at once (1: as recorded). Answers one row a chunk. */
function accountOf(run, heroes) {
  const counters = {}, rows = [];
  let salvaged = 0;
  for (const t of run.trace) {
    const kills = luckOf(counters, run.roster), salv = salvageLuckOf(salvaged);
    rows.push({ ...t, bLuck: kills, sLuck: salv, pmKills: luckPm(kills), pmAll: luckPm(kills + salv), salvagedBefore: salvaged });
    for (const [id, n] of Object.entries(t.killsBy)) counters[id] = (counters[id] || 0) + n * heroes;
    salvaged += t.gearGold * heroes;
  }
  return { rows, counters, salvaged };
}

if (mode === 'table') {
  const run = JSON.parse(readFileSync(resolve(arg('in')), 'utf8')), heroes = Math.max(1, Number(arg('heroes', run.heroes || 1)) || 1);
  const n = run.party.length, acct = accountOf(run, heroes), rows = acct.rows;
  const who = n > 1 ? `one account's ${n} heroes in one hunt (${run.party.join('+')}, ${run.policy})` : heroes > 1 ? `one account's ${heroes} heroes hunting apart, each a lone ${run.party[0]} (${run.policy})` : `a one-hero account, a lone ${run.party[0]} (${run.policy})`;
  console.log(`${who}. Hours are hours EACH hero has hunted. Rares and gold are one hero's share.`);
  console.log('hours | Level | ground | Luck: Bestiary + salvage | bonus: kills only / with salvage | Rares an hour: today / kills only / with salvage | gear salvaged instead of sold, an hour (share of coin + sold loot) | gold given up so far | next salvage point costs');
  const win = (at) => rows.filter((t) => t.hours > at - Math.max(5, at / 10) && t.hours <= at + 1e-9);
  for (const at of MARKS) {
    const b = win(at);
    if (!b.length || b[b.length - 1].hours < at - 1) { console.log(`${at} | not reached`); continue; }
    const H = sum(b, (t) => t.h), last = b[b.length - 1];
    const e0 = sum(b, (t) => t.expBase) / H / n, eK = sum(b, (t) => t.expBase * (1 + t.pmKills / 1000)) / H / n, eA = sum(b, (t) => t.expBase * (1 + t.pmAll / 1000)) / H / n;
    const gear = sum(b, (t) => t.gearGold) / H / n, inc = sum(b, (t) => t.income) / H / n;
    const given = sum(rows.filter((t) => t.hours <= at + 1e-9), (t) => t.gearGold) / n;
    console.log(`${at} | ${Math.min(...last.levels)} | ${last.ground}${last.tier === 'normal' ? '' : ' (' + last.tier + ')'} | ${last.bLuck} + ${last.sLuck} = ${last.bLuck + last.sLuck} | +${pct(last.pmKills)} / +${pct(last.pmAll)} | ${e0.toFixed(2)} / ${eK.toFixed(2)} / ${eA.toFixed(2)} | ${Math.round(gear)} (${(100 * gear / inc).toFixed(0)}% of ${Math.round(inc)}) | ${k(given)} | ${k(salvageCostTo(last.sLuck + 1) - salvageCostTo(last.sLuck))}`);
  }
  const T = rows[rows.length - 1], tot = (f) => sum(rows, f) / n;
  console.log(`whole life, a hero: Rares ${tot((t) => t.expBase).toFixed(0)} today, ${tot((t) => t.expBase * (1 + t.pmKills / 1000)).toFixed(0)} on kills alone, ${tot((t) => t.expBase * (1 + t.pmAll / 1000)).toFixed(0)} salvaging everything; coin + sold loot ${k(tot((t) => t.income))}, of it worn gear ${k(tot((t) => t.gearGold))} (rolled Scarce gear sold: ${k(tot((t) => t.scarceGold))}); store bill ${k(tot((t) => t.store))}`);
  const firstAt = (f) => { const t = rows.find(f); return t ? t.hours.toFixed(0) + ' h' : 'not reached'; };
  console.log('Bestiary Luck reached at: ' + [1, 10, 25, 50, 100, 150, 200].map((L) => `${L}: ${firstAt((t) => t.bLuck >= L)}`).join(' · '));
  console.log('salvage Luck reached at: ' + [1, 10, 25, 50, 100, 150].map((L) => `${L}: ${firstAt((t) => t.sLuck >= L)}`).join(' · '));
  console.log(`at the end (${T.hours.toFixed(0)} h a hero): the Bestiary holds ${luckOf(acct.counters, run.roster)} of ${run.roster.length * LUCK_STAGES.length}; creatures at the last stage: ${run.roster.filter((id) => stagesAt(acct.counters[id] || 0) === LUCK_STAGES.length).length} of ${run.roster.length}`);
  process.exit(0);
}

const { loadCellRunner } = await import('../cell.mjs');
const { sourceQuery } = await import('../../lib/version-stamp.mjs');
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
/* worn gear a kill drops, and what the shop pays for it (the catalogue's own price): what salvaging gives up */
const PLAY = await (await import(u('tests/hunt-core/fixtures/play-ground.mjs'))).loadPlay(ROOT);
const GEAR_TYPES = ['weapon', 'armor', 'offhand', 'jewelry'];
const isGear = (id) => !!PLAY.ITEMS[id] && GEAR_TYPES.includes(PLAY.ITEMS[id].type);
const shopOf = (id) => PLAY.vendorPriceOf(PLAY.ITEMS, id) || 0;

if (mode === 'curve') {
  console.log(`THE BESTIARY (one count a creature for the whole account, +1 Luck a stage): ${LUCK_STAGES.join(' / ')} kills`);
  console.log(`SALVAGE (worn gear the account's own hunts dropped, by the shop's price): point n costs ${SALVAGE_STEP} x n gold of it; point 1 / 10 / 50 / 100 / 200 costs ${[1, 10, 50, 100, 200].map((n) => k(salvageCostTo(n) - salvageCostTo(n - 1))).join(' / ')}, ${[10, 50, 100, 200].map((n) => n + ' points ' + k(salvageCostTo(n))).join(', ')} in all`);
  console.log(`bonus = floor(${LUCK_CAP_PM} x Luck / (Luck + ${LUCK_HALF})) permille on ${LUCK_BANDS.join(' and ')} rows only; Luck = the Bestiary's + salvage's`);
  console.log(`open grounds: ${OPEN.length}, creatures on them: ${ROSTER.length}, Luck their stages hold: ${ROSTER.length * LUCK_STAGES.length} (+${pct(luckPm(ROSTER.length * LUCK_STAGES.length))} alone)`);
  console.log('Luck | bonus | a 10 h Rare comes every | a 125 h Trophy comes every');
  for (const L of [0, 1, 5, 10, 25, 50, 100, 150, 200, 300, 500, 1000, 5000]) console.log(`${L} | +${pct(luckPm(L))} | ${(10 / luckMult(L)).toFixed(1)} h | ${(125 / luckMult(L)).toFixed(0)} h`);
  const gearRows = ROSTER.flatMap((id) => ((MON[id] || {}).drops || []).filter((d) => isGear(d.id)));
  console.log(`creatures with a Rare or Trophy row: ${ROSTER.filter((id) => revealRows(id).length).length} of ${ROSTER.length} (${ROSTER.reduce((s, id) => s + revealRows(id).length, 0)} rows); worn-gear rows: ${gearRows.length}, by band ${JSON.stringify(gearRows.reduce((m, d) => { m[d.band || '?'] = (m[d.band || '?'] || 0) + 1; return m; }, {}))}`);
  process.exit(0);
}

/* ---- life ---- */
const POLICIES = ['rec', 'dangerous', 'deadly'], LUCKS = ['off', 'kills', 'all'];
const policy = arg('policy', 'rec'), party = String(arg('party', '')).split(',').filter(Boolean), maxHours = Number(arg('max', 500)), luck = arg('luck', 'off');
const heroes = Math.max(1, Math.floor(Number(arg('heroes', 1)) || 1));
if (!party.length || !POLICIES.includes(policy) || !LUCKS.includes(luck) || !(maxHours > 0) || (heroes > 1 && party.length > 1)) { console.error(USAGE); process.exit(2); }
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
const dropMultOf = (id) => (Number((MON[id] || {}).dropBonus) > 0 ? Number(MON[id].dropBonus) : 1);
/* the expected Rare and Trophy drops of `kills` { creature: n } at multiplier `mult`, by the game's own chance function */
function expected(kills, mult) {
  let e = 0;
  for (const [id, n] of Object.entries(kills)) for (const d of revealRows(id)) e += n * Math.min(0.95, effectiveDropChance(d, { dropMult: dropMultOf(id) }) * mult);
  return e;
}
/* the expected shop value of the worn gear `kills` drop, every band, at today's chances */
function gearGoldOf(kills) {
  let gold = 0;
  for (const [id, n] of Object.entries(kills)) for (const d of (MON[id] || {}).drops || []) if (isGear(d.id)) gold += n * effectiveDropChance(d, { dropMult: dropMultOf(id) }) * shopOf(d.id);
  return gold;
}

const seats = party.map(() => ({ levelXp: 0, skills: {} }));
const lv = (s) => XP.charLevelFromXp(s.levelXp);
const counters = {}, trace = [];
let hours = 0, chunk = 0, salvaged = 0;
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
  const held = luck === 'off' ? 0 : luckOf(counters, ROSTER) + (luck === 'all' ? salvageLuckOf(salvaged) : 0), mult = luckMult(held);
  const undo = luck === 'off' ? () => {} : applyLuck(mult);
  let m;
  try { m = R.runCell(cell); } finally { undo(); }
  const h = m.party.hours;
  m.heroes.forEach((x, i) => {
    const s = seats[i];
    s.levelXp = Math.max(XP.charXpForLevel(lv(s)), s.levelXp + x.raw.levelXp - x.raw.xpLostLevel);
    for (const key of Object.keys({ ...x.raw.skillXp, ...x.raw.xpLostSkill })) s.skills[key] = Math.max(0, (s.skills[key] || 0) + (x.raw.skillXp[key] || 0) - (x.raw.xpLostSkill[key] || 0));
  });
  /* the chunk's kills by creature (the cell answers them per hour): ONE count a kill for the account, whoever of its heroes was there */
  const killsBy = Object.fromEntries(Object.entries(m.party.killsByPerH).map(([id, perH]) => [id, Math.round(perH * h)]));
  const gearGold = gearGoldOf(killsBy);
  for (const [id, n] of Object.entries(killsBy)) counters[id] = (counters[id] || 0) + n * heroes;
  salvaged += gearGold * heroes;
  hours += h;
  trace.push({ chunk, h, hours: Math.round(hours * 100) / 100, ground, tier, levels, held, killsBy, gearGold,
    expBase: expected(killsBy, 1), expLuck: expected(killsBy, mult), rolled: m.heroes.reduce((s, x) => s + x.rareItems, 0),
    income: m.heroes.reduce((s, x) => s + x.raw.income, 0), coin: m.heroes.reduce((s, x) => s + x.raw.coin, 0), store: m.heroes.reduce((s, x) => s + x.raw.store, 0),
    scarceGold: m.heroes.reduce((s, x) => s + (x.lootPerH.scarce || 0) * x.hours, 0), rareGold: m.heroes.reduce((s, x) => s + x.raw.rares, 0),
    deaths: m.heroes.reduce((s, x) => s + x.deaths, 0) });
  chunk++;
}

const n = party.length;
console.log(`${party.join('+')} (${policy}, played, ${heroes > 1 ? heroes + ' heroes apart, ' : ''}Luck in the roll: ${luck}): ${hours.toFixed(1)} h -> Level ${seats.map(lv).join('/')}; the Bestiary ${luckOf(counters, ROSTER)} of ${ROSTER.length * LUCK_STAGES.length}, salvage ${salvageLuckOf(salvaged)} from ${k(salvaged)} gold of gear`);
console.log(`  a hero: rolled Rares ${(sum(trace, (t) => t.rolled) / n).toFixed(1)}, expected today ${(sum(trace, (t) => t.expBase) / n).toFixed(1)}, expected at this run's Luck ${(sum(trace, (t) => t.expLuck) / n).toFixed(1)}; income ${Math.round(sum(trace, (t) => t.income) / n)}, store ${Math.round(sum(trace, (t) => t.store) / n)}, deaths ${sum(trace, (t) => t.deaths)}`);
if (arg('out', null)) writeFileSync(resolve(arg('out')), JSON.stringify({ policy, party, heroes, luck, hours, reached: seats.map(lv), trace, roster: ROSTER }));
