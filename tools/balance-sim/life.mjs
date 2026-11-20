#!/usr/bin/env node
// tools/balance-sim/life.mjs — A PLAYED LIFE on the real engine: a hero or a party from Level 1, hour by hour, on a tier
// (lane/d-balance-audit-2, 2026-11-19; the board's "2026-11-19 Complete balance look").
//
// career.mjs measures the plain hero on Normal for the pace of record. A life measures what players do: the played profile
// (played.mjs: the recorded bars, accessories, spent ammo), a tier, and every supply bought at the store, with Level XP and skill
// XP carried from chunk to chunk less what each death took back. It reproduced real accounts on 2026-11-19: the newest player's
// first 12 hours to the Level, and the busiest four's Level 25 / 50 / 70 within 10%. A what-if tool: it writes nothing under src/.
// playLife() is the same life for a caller (tests/start-kit-pace.mjs plays the start-kit hero with it, 2026-11-20).
//
//   node tools/balance-sim/life.mjs --party mage --policy dangerous --to 70 [--max 220] [--monsters hp=1.1,atk=1.1] [--plain] [--out file.json]
//
//   --party    styles, comma separated (styles.mjs): hammer | tank,healer,bow,mage | ...
//   --policy   rec        the ground the Hunts window advises (src/shell/hunt-list.js recommendedHunt), Normal
//              dangerous  the advised ground on Dangerous, from its floor up
//              deadly     the advised ground on its hardest tier
//              push       the highest open ground whose floor is at most 10 Levels over the party, on its hardest tier
//              idle       the start kit and the start bar, 6 hours in the Mill Cellar (or until its hunt ends at its endsAtLevel), then the advised ground (the idle newcomer)
//   --monsters every monster row scaled for this run (calibrate.mjs scaleMonsters): a stand-in for a STAT_FORMULA change
//   --plain    the harness's plain hero instead of the played one
//
// Prints hours, net gold, deaths and combat skills at each Level mark, then one line a Level band (hours, Level XP an hour, gold in
// and out, deaths). Chunks are 15 minutes under Level 8, 30 under 12, then an hour. Exit 0 when it ran, 2 on a bad argument.
import { writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCellRunner } from './cell.mjs';
import { sourceQuery } from '../lib/version-stamp.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const POLICIES = Object.freeze(['rec', 'dangerous', 'deadly', 'push', 'idle']);

let loaded = null;
/* the engine and the data a life reads, loaded once a process (a caller plays several lives) */
async function world(root) {
  if (loaded && loaded.root === root) return loaded;
  const u = (p) => pathToFileURL(join(root, p)).href;
  const R = await loadCellRunner(root);
  const { BUILD } = await import(u('src/build-info.js'));
  const { recommendedHunt } = await import(u('src/shell/hunt-list.js') + sourceQuery(root));
  const T = await import(u('src/data/hunt-tiers.js'));
  const G = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  const { contractXpPerH } = await import(u('src/data/balance-sheet.js'));
  const huntOf = (g) => HUNT_INDEX[G.HUNT_GROUNDS[g].hunt || g];
  const OPEN = (Array.isArray(G.OPEN_GROUNDS) ? G.OPEN_GROUNDS : Object.keys(G.OPEN_GROUNDS)).filter((g) => !huntOf(g).staged);
  loaded = { root, R, BUILD, recommendedHunt, T, G, OPEN, floorOf: (g) => huntOf(g).band[0], contractXpPerH };
  return loaded;
}

/** One life: `party` (styles) on `policy` from Level 1 until every seat reaches `to` or `maxHours` pass. `xp` ({ charLevelFromXp,
    charXpForLevel }) reads Levels on another curve than the game's (a caller's planted curve; the engine keeps the game's).
    Returns { hours, reached, miles, trace, bank, contractXpPerH }: miles['seat:Level'] = { h, bank, ground, tier, skills }. */
export async function playLife({ party, policy = 'rec', to = 50, maxHours = 300, plain = false, xp = null, root = ROOT }) {
  if (!Array.isArray(party) || !party.length || !POLICIES.includes(policy) || !(to > 1) || !(maxHours > 0)) throw new Error('playLife: bad arguments');
  const W = await world(root), { R, recommendedHunt, T, G, OPEN, floorOf } = W, XP = xp || R.XP;
  const seats = party.map(() => ({ levelXp: 0, skills: {} }));
  const bank = party.map(() => ({ coin: 0, loot: 0, store: 0, deaths: 0 }));
  const lv = (s) => XP.charLevelFromXp(s.levelXp);
  const trace = [], miles = {};
  let hours = 0, chunk = 0;
  while (hours < maxHours && Math.min(...seats.map(lv)) < to) {
    const levels = seats.map(lv), L = Math.min(...levels);
    const chunkH = L < 8 ? 0.25 : L < 12 ? 0.5 : 1;
    let ground = recommendedHunt(levels, party.length).hunt, tier = 'normal', extra = {};
    /* the idle newcomer stays in the Cellar for its first 6 hours, or until the Cellar's hunt ends for it (hunt-grounds.js endsAtLevel: the
       end card then names the advised ground, which it takes) */
    if (policy === 'idle') {
      const exit = G.HUNT_GROUNDS.mill_cellar.endsAtLevel;
      if (hours < 6 && !(Number.isInteger(exit) && Math.max(...levels) >= exit)) ground = 'mill_cellar';
      extra = { startBar: true, gear: { starter: true }, profile: undefined };
    }
    if (policy === 'push') { const ok = OPEN.filter((g) => floorOf(g) <= L + 10).sort((a, b) => floorOf(b) - floorOf(a)); if (ok.length) ground = ok[0]; }
    if (policy === 'deadly' || policy === 'push') { const ts = T.tiersOf(ground); tier = ts[ts.length - 1]; }
    if (policy === 'dangerous' && T.tiersOf(ground).includes('dangerous') && L >= floorOf(ground)) tier = 'dangerous';
    const pull = tier === 'normal' ? null : T.pullOfTier(T.tierRowOf(ground, tier), party.length);
    const cell = { id: 'life:' + chunk, ground, party, startBySeat: seats.map((s) => ({ levelXp: s.levelXp, skills: { ...s.skills } })), hours: chunkH, seeds: 1,
      seedBase: 7000 + chunk, segmentH: chunkH, windowMs: 600000, supply: 'store', ...(plain ? {} : { profile: 'played' }),
      ...(tier === 'normal' ? {} : { options: { tier } }), ...(pull ? { density: pull } : {}), ...extra };
    const m = R.runCell(cell), h = m.party.hours, before = seats.map((s) => s.levelXp);
    m.heroes.forEach((x, i) => {
      const s = seats[i], b = bank[i];
      s.levelXp = Math.max(XP.charXpForLevel(lv(s)), s.levelXp + x.raw.levelXp - x.raw.xpLostLevel);
      for (const k of Object.keys({ ...x.raw.skillXp, ...x.raw.xpLostSkill })) s.skills[k] = Math.max(0, (s.skills[k] || 0) + (x.raw.skillXp[k] || 0) - (x.raw.xpLostSkill[k] || 0));
      b.coin += x.raw.coin; b.loot += x.raw.income - x.raw.coin; b.store += x.raw.store; b.deaths += x.deaths;
    });
    /* a Level crossed inside the chunk is dated by linear interpolation of the chunk's XP (career.mjs) */
    seats.forEach((s, i) => {
      for (let q = XP.charLevelFromXp(before[i]) + 1; q <= lv(s); q++) {
        const need = XP.charXpForLevel(q), f = s.levelXp > before[i] ? (need - before[i]) / (s.levelXp - before[i]) : 1;
        if (miles[i + ':' + q] === undefined) miles[i + ':' + q] = { h: Math.round((hours + f * h) * 100) / 100, bank: { ...bank[i] }, ground, tier,
          skills: Object.fromEntries(R.COMBAT_SKILLS.map((k) => [k, R.XP.skillLevelFromXp(k, s.skills[k] || 0)])) };
      }
    });
    hours += h;
    trace.push({ chunk, h, hours: Math.round(hours * 100) / 100, ground, tier, levels, deaths: m.heroes.map((x) => x.deaths), xpPerH: m.heroes.map((x) => x.levelXpPerH),
      coinPerH: m.heroes.map((x) => x.coinPerH), incomePerH: m.heroes.map((x) => x.incomePerH), storePerH: m.heroes.map((x) => x.storePerH), lowHp: m.heroes.map((x) => x.encMinHpPct.p50) });
    chunk++;
  }
  return { hours, reached: seats.map(lv), miles, trace, bank, contractXpPerH: W.contractXpPerH };
}

async function main() {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const policy = arg('policy', 'rec'), party = String(arg('party', '')).split(',').filter(Boolean);
  const target = Number(arg('to', 50)), maxHours = Number(arg('max', 300)), plain = process.argv.includes('--plain');
  if (!party.length || !POLICIES.includes(policy) || !(target > 1) || !(maxHours > 0)) {
    console.error('usage: node tools/balance-sim/life.mjs --party <style,...> --policy ' + POLICIES.join('|') + ' --to <Level> [--max hours] [--monsters hp=1.1,atk=1.1] [--plain] [--out file.json]');
    process.exit(2);
  }
  await world(ROOT);
  if (arg('monsters', null)) {
    const { scaleMonsters } = await import('./calibrate.mjs');
    await scaleMonsters(Object.fromEntries(arg('monsters').split(',').map((p) => p.split('=')).map(([k, x]) => [k, Number(x)])));
  }
  const { hours, reached, miles, trace, contractXpPerH } = await playLife({ party, policy, to: target, maxHours, plain });
  const k = (n) => Math.round(n / 1000) + 'k';
  console.log(`${party.join('+')} (${policy}${policy === 'idle' ? ', start kit' : plain ? ', plain' : ', played'}${arg('monsters', null) ? ', monsters ' + arg('monsters') : ''}): ${hours.toFixed(1)} h -> Level ${reached.join('/')}`);
  for (const Lm of [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110]) {
    const r = party.map((_, i) => miles[i + ':' + Lm]);
    if (!r.every(Boolean)) continue;
    console.log(`  Level ${Lm} at ${r[0].h} h on ${r[0].ground} (${r[0].tier}): ` + r.map((x, i) => `${party[i]} net ${k(x.bank.coin + x.bank.loot - x.bank.store)} (store ${k(x.bank.store)}), ${x.bank.deaths} deaths, ` +
      Object.entries(x.skills).filter(([, v]) => v > 1).map(([s, v]) => s + ' ' + v).join(' ')).join(' | '));
  }
  const EDGES = [1, 10, 25, 40, 55, 70, 85, 100, 1e9], n = party.length, mean = (a) => a.reduce((s, x) => s + x, 0) / n;
  console.log('  band | hours | Level XP an hour a hero (x the pace contract at the band\'s middle) | coin / income / store an hour a hero | deaths | first seat\'s typical low HP');
  for (let b = 0; b < EDGES.length - 1; b++) {
    const tr = trace.filter((t) => Math.min(...t.levels) >= EDGES[b] && Math.min(...t.levels) < EDGES[b + 1]);
    if (!tr.length) continue;
    const H = tr.reduce((s, t) => s + t.h, 0), w = (f) => tr.reduce((s, t) => s + t.h * mean(f(t)), 0) / H;
    const mid = (EDGES[b] + Math.min(EDGES[b + 1], Math.max(...reached))) / 2, low = tr.map((t) => t.lowHp[0]).sort((a, c) => a - c);
    console.log(`  ${EDGES[b]}-${EDGES[b + 1] > 999 ? '' : EDGES[b + 1] - 1} | ${H.toFixed(1)} | ${k(w((t) => t.xpPerH))} (${(w((t) => t.xpPerH) / contractXpPerH(mid)).toFixed(2)}) | ${k(w((t) => t.coinPerH))} / ${k(w((t) => t.incomePerH))} / ${k(w((t) => t.storePerH))} | ${tr.reduce((s, t) => s + t.deaths.reduce((a, x) => a + x, 0), 0)} | ${low[low.length >> 1]}%`);
  }
  if (arg('out', null)) writeFileSync(resolve(arg('out')), JSON.stringify({ policy, party, hours, reached, miles, trace }));
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
