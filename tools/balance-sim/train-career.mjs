#!/usr/bin/env node
// tools/balance-sim/train-career.mjs — A HERO WHO TRAINS EVERY SPARE HOUR, ON THE REAL ENGINE (a measuring tool: it grades nothing).
//
// Tyler 2026-11-14 accepted the training design (30,000 skill XP an hour, 60,000 with a training item, 250,000 gold for 12 h and
// 450,000 for 24 h; src/data/training.js) "as a good start", with "a train-every-spare-hour career run owed before it ships". This
// is that run. A hero lives day by day: it hunts its day's hours where the Hunts window recommends (career.mjs's chunk, the real
// settle, the best gear its Level may wear), carrying Level XP, skill XP and deaths; then, from Level 10 (TRAINING_RULES.minLevel),
// it trains its main skill at the yard for the rest of the day, hour by hour, ON THE REAL ENGINE (play-ground.mjs run on the
// training ground, the server's xp carry, the item's hours as the server reads them: trainBoostMs). The yard's fee is the server's
// rule (training.js trainingFee at the skill's level at each hour's first instant: hr_training_fee) and is paid from the purse the
// hunts filled (coin and sold loot with rares, less the store bill: audit-table.mjs gold's measure). With `--train items` the hero buys a
// training item with its own gold whenever its bank for that skill is empty and the purse holds the price (24 h first, else 12 h);
// `--train crowns` trains every hour at the item's rate with no gold (the Crowns store's bound copy: the pay-to-win ceiling).
//
//   node tools/balance-sim/train-career.mjs --style hammer [--to 60] [--day 12:12] [--train plain|items|crowns|none] [--skill melee]
//                                           [--seed 0] [--json out.json]
//   node tools/balance-sim/train-career.mjs compare a.json b.json ...   the runs side by side: by Level and by hunting hour
//   node tools/balance-sim/train-career.mjs probe a.json b.json [--levels 20,30,40,50] [--hours 2] [--seeds 2] [--tier deadly]
//                                           each run's hero at those Levels (its career skills) on the recommended ground and the next one up
//
// `--day H:T`: H hunting hours and T training hours a day (12:12 premium, 8:16 free: stamina rests 1:1 while a hero trains).
// `--train none` is the hunt-only career on the same days (the baseline). Every training hour is checked as it settles: it must
// pay the trained skill exactly the rate (and the item's), nothing else (no Level XP, coin, item or other skill); a breach is listed.
//
// Exit: 0 ran (and no training hour off the rate) · 1 a training hour off the rate · 2 harness.
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCellRunner } from './cell.mjs';
import { STYLES } from './gear.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const HOUR = 3600000;
const COMBAT = ['melee', 'ranged', 'magic', 'defense'];
/** The skill a way to fight trains when it trains its own (the board's crossing table: a tank trains Defense). */
export const MAIN_SKILL = Object.freeze({ hammer: 'melee', sword: 'melee', axes: 'melee', tank: 'defense', bow: 'ranged', crossbow: 'ranged', mage: 'magic', healer: 'magic' });

export async function loadTrainCareer(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const R = await loadCellRunner(root);
  const { loadPlay } = await import(u('tests/hunt-core/fixtures/play-ground.mjs'));
  const play = await loadPlay(root);
  const { BUILD } = await import(u('src/build-info.js'));
  const v = '?v=' + BUILD.version;
  const T = await import(u('src/data/training.js') + v);
  const G = await import(u('src/data/hunt-grounds.js'));
  const { recommendedHunt } = await import(u('src/shell/hunt-list.js') + v);
  const XP = R.XP;
  const lvOf = (st) => XP.charLevelFromXp(st.levelXp);
  const skLv = (st, k) => XP.skillLevelFromXp(k, st.skills[k] || 0);

  /** One career: { style, to, day: [H, T], train: 'none'|'plain'|'items'|'crowns', skill, seed, maxDays } -> { rows (one a day), milestones, breaches }. */
  function runTrainCareer(job) {
    const style = job.style, role = STYLES[style].role, skill = job.skill || MAIN_SKILL[style];
    const [huntH, trainH] = job.day;
    const st = { levelXp: XP.charXpForLevel(1), skills: {}, gold: 0, bank: 0 };
    const tot = { huntH: 0, trainH: 0, earned: 0, fees: 0, items: 0, itemGold: 0, itemHUsed: 0, trainXp: 0, deaths: 0, goldOut: 0 };
    const rows = [], milestones = {}, breaches = [];
    let chunk = 0;
    const chunkOf = (L) => (L >= 12 ? 1 : L >= 8 ? 0.5 : 0.25);   // audit-table.mjs gold's chunks: short while Levels come in minutes
    for (let day = 1; day <= (job.maxDays || 400) && lvOf(st) < job.to; day++) {
      /* THE DAY'S HUNT: chunk by chunk where the Hunts window recommends, carrying everything (career.mjs runCareer's step) */
      let left = huntH;
      const grounds = new Set();
      while (left > 1e-9 && lvOf(st) < job.to) {
        const L = lvOf(st);
        const h = Math.min(left, chunkOf(L));
        const ground = recommendedHunt([L], 1).hunt;
        grounds.add(ground);
        const m = R.runCell({ id: 'tc:' + style + ':' + chunk, ground, party: [style], startBySeat: [{ levelXp: st.levelXp, skills: { ...st.skills } }],
          hours: h, seeds: 1, seedBase: (job.seed || 0) * 100000 + chunk, segmentH: h, windowMs: 600000 });
        const x = m.heroes[0], before = st.levelXp, played = m.party.hours;
        st.levelXp = Math.max(XP.charXpForLevel(L), st.levelXp + x.raw.levelXp - x.raw.xpLostLevel);
        for (const k of Object.keys({ ...x.raw.skillXp, ...x.raw.xpLostSkill })) st.skills[k] = Math.max(0, (st.skills[k] || 0) + (x.raw.skillXp[k] || 0) - (x.raw.xpLostSkill[k] || 0));
        const net = Math.round(x.raw.income + x.raw.rares - x.raw.store);
        st.gold += net; tot.earned += net; tot.deaths += x.deaths;
        for (let lv = XP.charLevelFromXp(before) + 1; lv <= lvOf(st); lv++) {
          const f = st.levelXp > before ? (XP.charXpForLevel(lv) - before) / (st.levelXp - before) : 1;
          if (milestones[lv] === undefined) milestones[lv] = { huntH: Math.round((tot.huntH + f * played) * 100) / 100, trainH: tot.trainH, day,
            skills: Object.fromEntries(COMBAT.map((k) => [k, skLv(st, k)])), earned: tot.earned, spent: tot.fees + tot.itemGold };
        }
        tot.huntH += played; left -= h; chunk++;
      }
      /* THE DAY'S TRAINING: hour by hour on the real engine, from Level 10, the fee first (an hour the purse can't pay ends it) */
      let trained = 0;
      if (job.train !== 'none' && lvOf(st) >= T.TRAINING_RULES.minLevel) {
        const id = T.trainingHuntId('yard', skill);
        for (let k = 0; k < trainH; k++) {
          const fee = T.trainingFee(skLv(st, skill));
          if (st.gold < fee) { tot.goldOut++; break; }
          st.gold -= fee; tot.fees += fee;
          if (job.train === 'items' && st.bank <= 0) {
            const size = st.gold >= T.TRAINING_GEAR.gold[24] ? 24 : st.gold >= T.TRAINING_GEAR.gold[12] ? 12 : 0;
            if (size) { st.gold -= T.TRAINING_GEAR.gold[size]; tot.itemGold += T.TRAINING_GEAR.gold[size]; tot.items++; st.bank += size * HOUR; }
          }
          /* `crowns`: the Crowns store's bound copy, every hour (no gold: the item count is what a Crowns buyer pays for) */
          if (job.train === 'crowns' && st.bank <= 0) { tot.items++; st.bank += 24 * HOUR; }
          const boostMs = Math.min(HOUR, st.bank);
          const L = lvOf(st);
          const r = play.run(id, L, [role], { ground: G.TRAINING_GROUNDS[id], spanMs: HOUR, windowMs: 600000, xpFrac: true,
            start: () => ({ levelXp: st.levelXp, skills: { ...st.skills } }), session: { trainBoostMs: boostMs },
            equipment: () => R.gear.kitOf(style, L, {}) });
          const xp = r.heroXp[role + '0'] || {};
          const want = T.TRAINING_RULES.xpPerHour + Math.floor(T.TRAINING_RULES.xpPerHour * (T.TRAINING_GEAR.boostPermille - 1000) / 1000 * boostMs / HOUR);
          const other = Object.entries(xp).filter(([s, n]) => s !== skill && n > 0);
          if ((xp[skill] || 0) !== want || r.playedMs !== HOUR || other.length || r.levelXp || r.coin || Object.keys(r.items).length || r.falls) {
            breaches.push({ day, hour: k, skill, xp: xp[skill] || 0, want, played: r.playedMs, other, levelXp: r.levelXp, coin: r.coin, items: r.items, falls: r.falls });
          }
          st.skills[skill] = (st.skills[skill] || 0) + (xp[skill] || 0);
          st.bank -= boostMs; tot.itemHUsed += boostMs / HOUR; tot.trainXp += xp[skill] || 0;
          trained++;
        }
      }
      tot.trainH += trained;
      rows.push({ day, level: lvOf(st), huntH: Math.round(tot.huntH * 100) / 100, trainH: tot.trainH, grounds: [...grounds],
        skills: Object.fromEntries(COMBAT.map((k) => [k, skLv(st, k)])), earned: tot.earned, fees: tot.fees, items: tot.items, itemGold: tot.itemGold,
        itemHUsed: Math.round(tot.itemHUsed * 100) / 100, bankH: Math.round((st.bank / HOUR) * 100) / 100, purse: st.gold, deaths: tot.deaths, goldOut: tot.goldOut });
    }
    return { style, skill, to: job.to, day: job.day, train: job.train, seed: job.seed || 0, version: BUILD.version, reached: lvOf(st), rows, milestones, breaches, totals: tot };
  }
  return { runTrainCareer };
}

/* ── COMPARE: runs side by side ───────────────────────────────────────────────────────────────────────────────────────────────── */
const tag = (r) => r.style + ' ' + r.train + ' ' + r.day.join(':');
function compare(files) {
  const runs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const levels = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].filter((L) => runs.some((r) => r.milestones[L]));
  console.log('\nBY LEVEL: hunting hours to reach it, training hours by then, the main skill (and the others), gold earned / spent on training');
  for (const L of levels) {
    for (const r of runs) {
      const m = r.milestones[L];
      if (!m) continue;
      const others = COMBAT.filter((k) => k !== r.skill).map((k) => k[0].toUpperCase() + k.slice(1, 3) + ' ' + m.skills[k]).join(' ');
      console.log('  L' + String(L).padEnd(3) + tag(r).padEnd(24) + ' hunt ' + String(m.huntH).padStart(7) + ' h  train ' + String(m.trainH).padStart(5) + ' h  day '
        + String(m.day).padStart(3) + '  ' + r.skill + ' ' + String(m.skills[r.skill]).padStart(3) + '  (' + others + ')  earned ' + m.earned.toLocaleString('en-US')
        + '  spent ' + m.spent.toLocaleString('en-US'));
    }
  }
  console.log('\nBY DAY (the same hunting hours): Level and main skill');
  const days = [1, 2, 3, 5, 7, 10, 14, 18, 22, 26, 30];
  for (const d of days) {
    const cells = runs.map((r) => { const x = r.rows.find((y) => y.day === d) || null; return x ? tag(r) + ': L' + x.level + ' ' + r.skill + ' ' + x.skills[r.skill] : null; }).filter(Boolean);
    if (cells.length) console.log('  day ' + String(d).padStart(2) + '  ' + cells.join('  |  '));
  }
  console.log('\nTOTALS');
  for (const r of runs) {
    const t = r.totals, last = r.rows[r.rows.length - 1];
    console.log('  ' + tag(r).padEnd(24) + ' L' + r.reached + ' in ' + Math.round(t.huntH * 10) / 10 + ' hunting h + ' + t.trainH + ' training h (' + last.day + ' days), deaths ' + t.deaths
      + ', earned ' + t.earned.toLocaleString('en-US') + ', fees ' + t.fees.toLocaleString('en-US') + ', items ' + t.items + ' = ' + t.itemGold.toLocaleString('en-US')
      + ' (' + Math.round((100 * (t.fees + t.itemGold)) / Math.max(1, t.earned)) + '% of earned), purse ' + last.purse.toLocaleString('en-US') + ', item hours used ' + t.itemHUsed
      + ', gold-out stops ' + t.goldOut + ', breaches ' + r.breaches.length + ', skills ' + JSON.stringify(last.skills));
  }
}

/* ── PROBE: does a trained hero's lead trivialize a ground? ───────────────────────────────────────────────────────────────────────
   At each Level, each run's hero (its career skills at that Level, the Level's gear) hunts the ground the game recommends and the next
   ground up (under its floor: the band warns, nothing refuses, hunts.js), 2 seeds x `hours`. A ranged hero also plays the best store
   arrow its Ranged may shoot (ammo keeps its skill requirement: abilities.js shotLocked), the one gate a skill opens. */
async function probe(files, o) {
  const runs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const R = await loadCellRunner(ROOT);
  const u = (p) => pathToFileURL(join(ROOT, p)).href;
  const { BUILD } = await import(u('src/build-info.js'));
  const { recommendedHunt } = await import(u('src/shell/hunt-list.js') + '?v=' + BUILD.version);
  const G = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  const ITEMS = R.gear.ITEMS;
  const open = Object.keys(G.OPEN_GROUNDS).filter((g) => HUNT_INDEX[g] && HUNT_INDEX[g].band && !G.TRAINING_GROUNDS[g]);
  const nextUp = (g) => open.filter((x) => HUNT_INDEX[x].band[0] > HUNT_INDEX[g].band[0]).sort((a, b) => HUNT_INDEX[a].band[0] - HUNT_INDEX[b].band[0])[0] || null;
  const arrows = Object.keys(ITEMS).filter((id) => ITEMS[id].slot === 'ammo' && ITEMS[id].reqSkill === 'ranged' && /_arrows$/.test(id) && !/^plain_/.test(id));
  const bestArrow = (rangedLv) => arrows.filter((id) => (ITEMS[id].reqLv || 1) <= rangedLv).sort((a, b) => (ITEMS[a].tier || 0) - (ITEMS[b].tier || 0)).pop();
  console.log('Level | run | ground (floor) | ammo | XP/h | deaths | net g/h | low HP p10 % | main skill');
  for (const L of o.levels) {
    for (const r of runs) {
      const m = r.milestones[L];
      if (!m) continue;
      const rec = recommendedHunt([L], 1).hunt;
      for (const g of [rec, nextUp(rec)].filter(Boolean)) {
        const ammos = STYLES[r.style].role === 'ranger' ? [...new Set(['bronze_arrows', bestArrow(m.skills.ranged)])] : [null];
        for (const ammo of ammos) {
          const cell = { id: ['probe', r.style, r.train, L, g, ammo].join(':'), ground: g, party: [r.style], level: L, skillsBySeat: [m.skills], hours: o.hours, seeds: o.seeds,
            ...(ammo ? { gear: { ammo } } : {}), ...(o.tier && o.tier !== 'normal' ? { options: { tier: o.tier } } : {}) };
          const c = R.runCell(cell), h = c.heroes[0];
          console.log([L, tag(r), g + ' (' + HUNT_INDEX[g].band[0] + ')' + (o.tier ? ' ' + o.tier : ''), ammo || '-', h.levelXpPerH, h.deaths + ' in ' + h.hours + ' h', h.netWithRaresPerH, h.encMinHpPct.p10,
            r.skill + ' ' + m.skills[r.skill]].join(' | '));
        }
      }
    }
  }
}

async function main() {
  const a = process.argv.slice(2);
  if (a[0] === 'compare') return compare(a.slice(1));
  if (a[0] === 'probe') {
    const files = a.slice(1).filter((x) => /\.json$/.test(x));
    const arg0 = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
    return probe(files, { levels: arg0('levels', '20,30,40,50').split(',').map(Number), hours: Number(arg0('hours', 2)), seeds: Number(arg0('seeds', 2)), tier: arg0('tier', '') });
  }
  const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
  const style = arg('style', 'hammer');
  if (!STYLES[style]) { console.error('train-career: no style ' + style); process.exit(2); }
  const { runTrainCareer } = await loadTrainCareer(ROOT);
  const t0 = Date.now();
  const r = runTrainCareer({ style, to: Number(arg('to', 60)), day: arg('day', '12:12').split(':').map(Number), train: arg('train', 'plain'),
    skill: arg('skill', MAIN_SKILL[style]), seed: Number(arg('seed', 0)) });
  if (arg('json', '')) writeFileSync(arg('json', ''), JSON.stringify(r));
  for (const x of r.rows) {
    console.log('day ' + String(x.day).padStart(3) + '  L' + String(x.level).padEnd(3) + ' hunt ' + String(x.huntH).padStart(7) + ' h  train ' + String(x.trainH).padStart(5) + ' h  '
      + JSON.stringify(x.skills) + '  earned ' + x.earned + '  fees ' + x.fees + '  items ' + x.items + ' (' + x.itemGold + ')  purse ' + x.purse + '  bank ' + x.bankH + ' h  ' + x.grounds.join(','));
  }
  console.log('train-career ' + style + ' ' + r.train + ' ' + r.day.join(':') + ': L' + r.reached + ', ' + r.breaches.length + ' training hours off the rate, ' + Math.round((Date.now() - t0) / 1000) + ' s');
  if (r.breaches.length) { console.log(JSON.stringify(r.breaches.slice(0, 5))); process.exit(1); }
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
