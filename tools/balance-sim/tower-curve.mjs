#!/usr/bin/env node
// tools/balance-sim/tower-curve.mjs — THE BURNING TOWER'S DIFFICULTY CURVE, MEASURED BY FLOOR BAND ON THE REAL ENGINE (lane/d-tower-curve,
// 2026-11-19; Andy on live: "Everything between floor 100 > 170 felt the same. I was mid yellow at worse, then the last floor or two i started
// getting into red, then died pretty quickly"). A what-if tool: it writes nothing to src/.
//
//   node tools/balance-sim/tower-curve.mjs [--party tank,bow,mage,healer] [--level 74] [--seats <file.json>] [--from 1] [--minutes 70]
//        [--seeds 4] [--bands 50:200] [--json <out>]
//
//   --party/--level  a PLAYED party (cell.mjs profile 'played': the recorded bars, accessories, own stock, the party skill line) of those styles
//                    (styles.mjs) at that Level. --seats: real heroes instead, seat by seat (cell.mjs `seats`; a local file, never committed:
//                    a recorded party's XP, skills, worn set, bar, options and bag)
//   --from           the floor each climb starts on (1, or a landing + 1: a checkpoint, Tyler 2026-11-16). A list (1,101,151) plays each start
//   --minutes        the most a climb may run (the server ends it on a death, a floor's time or stamina)
//   --bands lo:hi    the bands reported, ten floors each (51-60 is "60"), lo and hi landings
//   --staged         the played party also wears what the STAGED grounds whose floor is at or under its Level drop (gear.mjs openAlso, the
//                    grid kit's rule, tools/balance-program/grid-kit.mjs stagedUpTo): the gear past Dawnsteel whose homes are built and
//                    hidden (src/data/gear-tiers.js STEP_TIERS, lane/gear-phase-b), so the climb reads the Level's own base as content opens
//
// Each climb is ONE cell (cell.mjs `tower`: the Tower's ground in its own session mode, an ended hero settled no more, one segment a seed), so
// every number is the engine's own: each floor's room (pull to pull) gives every seat a low HP %, a death gives 0 on the floor it fell. Per band:
//   reached    climbs that stood on a floor of the band / climbs
//   s a floor  the median time from one floor's clear to the next one's (the stair included)
//   low        THE TYPICAL LOW: the median, over the band's floors, of the party's lowest seat on that floor (the HP bar a player watches drop),
//              and the seat that was lowest most often
//   p10        the deep dips: the 10th percentile of the same lows
//   fell       climbs that ended with a death in the band / climbs that reached it (the chance a climb that gets here stops here)
// and per start: the top floor each climb reached, how it ended, its minutes, its Level XP an hour a head, and the keys it minted (each landing cleared, by key: chests.js
// keyForLanding).
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { isMain } from '../../tests/_is-main.mjs';
import { quantile } from './stats.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;

/** One climb's floors: { top, ended, minutes, floors: Map(floor -> { low, seat, fell }), cleared [[floor, ms]] } from a run cell's result. */
export function climbOf(res) {
  const floors = new Map();
  res.heroes.forEach((h, seat) => {
    for (const [floor, pct] of h.towerEnc || []) {
      if (!Number.isInteger(floor)) continue;
      const f = floors.get(floor) || { low: Infinity, seat: null, fell: false };
      if (pct < f.low) { f.low = pct; f.seat = seat; }
      if (pct <= 0) f.fell = true;
      floors.set(floor, f);
    }
  });
  const ended = res.heroes.map((h) => Object.keys(h.ended || {})[0] || 'time');
  const t = res.party.tower;
  return { top: t.top === null ? t.from - 1 : t.top, from: t.from, ended: ended.includes('died') ? 'died' : ended[0], minutes: Math.round(res.party.hours * 600) / 10, xpPerH: res.party.levelXpPerHeroPerH,
    floors, cleared: t.cleared };
}

/** The band table: one row per ten floors from lo to hi, read off `climbs` (climbOf). Pure. */
export function bandTable(climbs, lo, hi, every = 10) {
  const rows = [];
  for (let top = lo; top <= hi; top += every) {
    const from = top - every + 1;
    const lows = [], seats = {}, secs = [];
    let reached = 0, fell = 0;
    for (const c of climbs) {
      let here = false;
      for (const [f, x] of c.floors) {
        if (f < from || f > top) continue;
        here = true;
        lows.push(x.fell ? 0 : x.low);
        seats[x.seat] = (seats[x.seat] || 0) + 1;
      }
      if (here) reached++;
      /* the floor a climb fell on is the one after its last clear */
      if (c.ended === 'died' && c.top + 1 >= from && c.top + 1 <= top) fell++;
      const cl = c.cleared.slice().sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < cl.length; i++) if (cl[i][0] >= from && cl[i][0] <= top && cl[i][0] === cl[i - 1][0] + 1) secs.push((cl[i][1] - cl[i - 1][1]) / 1000);
    }
    const worst = Object.entries(seats).sort((a, b) => b[1] - a[1])[0];
    rows.push({ band: top, reached, climbs: climbs.length, secsPerFloor: secs.length ? Math.round(quantile(secs, 0.5) * 10) / 10 : null,
      low: lows.length ? Math.round(quantile(lows, 0.5)) : null, p10: lows.length ? Math.round(quantile(lows, 0.1)) : null,
      worstSeat: worst ? Number(worst[0]) : null, fell, fellPct: reached ? Math.round((100 * fell) / reached) : null });
  }
  return rows;
}

/** The keys a climb minted: every landing it cleared, by key id (chests.js keyForLanding). */
export function keysOf(climb, keyForLanding, every = 10) {
  const out = {};
  for (const [f] of climb.cleared) if (f % every === 0) { const k = keyForLanding(f); if (k) out[k.id] = (out[k.id] || 0) + 1; }
  return out;
}

/** Play `seeds` climbs from each start; answers { climbs: [climbOf], byStart }. */
export async function measure(o) {
  const { loadCellRunner } = await import(u('tools/balance-sim/cell.mjs'));
  const { TOWER_RULES } = await import(u('src/data/tower.js'));
  const R = o.runner || await loadCellRunner(ROOT);
  /* --staged: the staged grounds a hero of the Level has been sent to (its floor at or under the Level), opened for the kit */
  let gear = null;
  if (o.staged && !o.seats) {
    const G = await import(u('src/data/hunt-grounds.js')), { HUNT_INDEX } = await import(u('src/data/hunts.js'));
    const floorOf = (g) => ((HUNT_INDEX[G.HUNT_GROUNDS[g].hunt] || {}).band || [Infinity])[0];
    gear = { openAlso: Object.keys(G.HUNT_GROUNDS).filter((g) => !Object.prototype.hasOwnProperty.call(G.OPEN_GROUNDS, g) && floorOf(g) <= o.level) };
    if (o.say) o.say('  staged grounds opened for the kit: ' + (gear.openAlso.join(', ') || 'none'));
  }
  const climbs = [];
  for (const from of o.starts) for (let s = 0; s < o.seeds; s++) {
    const cell = { id: 'tower:' + from + ':' + s, ground: TOWER_RULES.hunt, tower: { floor: from }, hours: o.minutes / 60, seeds: 1, seedBase: (o.seedBase || 0) + s,
      windowMs: o.windowMs || 30000, ...(o.seats ? { seats: o.seats } : { party: o.party, level: o.level, profile: 'played', supply: 'own', ...(gear ? { gear } : {}) }) };
    const t0 = Date.now();
    const c = climbOf(R.runCell(cell));
    c.secs = Math.round((Date.now() - t0) / 1000);
    climbs.push(c);
    if (o.say) o.say(`  from ${from} seed ${s}: top ${c.top}, ${c.ended}, ${c.minutes} min (${c.secs}s)`);
  }
  return climbs;
}

if (isMain(import.meta.url)) {
  const a = process.argv.slice(2), val = (f, d) => { const i = a.indexOf(f); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
  const seats = val('--seats', null) ? JSON.parse(readFileSync(val('--seats'), 'utf8')) : null;
  const [lo, hi] = val('--bands', '50:200').split(':').map(Number);
  const o = { starts: val('--from', '1').split(',').map(Number), minutes: Number(val('--minutes', 70)), seeds: Number(val('--seeds', 4)), seedBase: Number(val('--seed-base', 0)),
    party: val('--party', 'tank,bow,mage,healer').split(','), level: Number(val('--level', 74)), seats, windowMs: Number(val('--window', 30000)), staged: a.includes('--staged'), say: console.log };
  const { keyForLanding } = await import(u('src/data/chests.js'));
  console.log(`THE BURNING TOWER BY FLOOR BAND: ${seats ? seats.length + ' recorded seats' : 'a played ' + o.party.join('+') + ' at Level ' + o.level + (o.staged ? ' (staged homes open)' : '')}, from ${o.starts.join(', ')}, ${o.seeds} seed(s), ${o.minutes} min at most`);
  const climbs = await measure(o);
  console.log('\n| Start | Top floor (each climb) | Ended | Minutes | Level XP an hour a head | Keys a climb (each) |\n|---|---|---|---|---|---|');
  for (const from of o.starts) {
    const cs = climbs.filter((c) => c.from === from);
    console.log(`| ${from} | ${cs.map((c) => c.top).join(' / ')} | ${cs.map((c) => c.ended).join(' / ')} | ${cs.map((c) => c.minutes).join(' / ')} | ${cs.map((c) => Math.round(c.xpPerH / 1000) + 'k').join(' / ')} | ${cs.map((c) => Object.entries(keysOf(c, keyForLanding)).map(([k, n]) => n + ' ' + k).join(' + ') || 'none').join(' / ')} |`);
  }
  const rows = bandTable(climbs, lo, hi);
  console.log('\n| Floors | Reached | s a floor | Typical low (worst seat) | p10 low | Fell here |\n|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.band - 9}-${r.band} | ${r.reached}/${r.climbs} | ${r.secsPerFloor ?? '-'} | ${r.low ?? '-'}%${r.worstSeat === null ? '' : ' (seat ' + r.worstSeat + ')'} | ${r.p10 ?? '-'}% | ${r.reached ? r.fell + '/' + r.reached : '-'} |`);
  if (val('--json', null)) writeFileSync(val('--json'), JSON.stringify({ o: { ...o, seats: undefined, say: undefined }, climbs: climbs.map((c) => ({ ...c, floors: [...c.floors] })), rows }, null, 1));
}
