#!/usr/bin/env node
// tools/balance-sim/b1120-table.mjs — LANE b-balance-1120's TABLES, read off the engine's cells (2026-11-01, v0.2.82).
//
//   node tools/balance-sim/sim.mjs --plan b1120  --out tools/balance-sim/out/b1120b   the panel's five claims at today's data (careers may run in out/b1120c, out/b1120c2)
//   node tools/balance-sim/sim.mjs --plan b1120w --out tools/balance-sim/out/b1120wb  the candidates on the same dice (never written to a data file)
//   node tools/balance-sim/sim.mjs --plan b1120g                                      the level-gap term on the same dice
//   node tools/qa/craft-economy.mjs --out tools/balance-sim/out/craft/after-tax.json --chains --hunts --rooms      the wage on the local world
//   node tools/balance-sim/b1120-table.mjs [--write]                prints every table; --write commits b1120-summary.json
//
// Every number is read off the cells; the only arithmetic here is pooling (hours-weighted), ratios and the Poisson interval.
// The board's "2026-11-01 Does the game meet the ruling" section is written from this output.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { round, rateCI } from './stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (p) => (existsSync(join(HERE, 'out', p)) ? readFileSync(join(HERE, 'out', p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const main = load('b1120b/cells.jsonl');
const cells = main.filter((r) => r.heroes);
/* the careers ran in their own pools (other lanes shared the PC); a career finished in two pools is read once */
const careers = [...new Map(['b1120b/cells.jsonl', 'b1120c/cells.jsonl', 'b1120c2/cells.jsonl'].flatMap((p) => load(p)).filter((r) => r.kind === 'career').map((c) => [c.id, c])).values()];
const what = load('b1120wb/cells.jsonl').filter((r) => r.heroes);
const gaps = load('b1120g/cells.jsonl').filter((r) => r.heroes);
const craft = existsSync(join(HERE, 'out/craft/after-tax.json')) ? JSON.parse(readFileSync(join(HERE, 'out/craft/after-tax.json'), 'utf8')) : null;
const SHORT = { mill_cellar: 'Cellar', meadowbrook_thicket: 'Thicket', wickstead: 'Wickstead', millrace_sewer: 'Sewer', mosslight_glade: 'Glade', coppercap_warrens: 'Warrens' };
const key = (party) => party.join('+');
const dens = (c) => (Number.isInteger(c.cell.density) ? c.cell.density : 0);
const stage = (c) => c.cell.x;
const starter = (c) => !!(c.cell.gear && c.cell.gear.starter);
const offset = (c) => (c.cell.gear && c.cell.gear.only) || null;

/** One cell's heroes pooled: per head rates, and the worst of its heroes for danger. */
function read(c) {
  const hs = c.heroes, hrs = hs.reduce((s, h) => s + h.hours, 0);
  const w = (f) => hs.reduce((s, h) => s + (f(h) || 0) * h.hours, 0) / (hrs || 1);
  const close = hs.reduce((s, h) => s + (h.closeCallsPer12h.k || 0), 0), deaths = hs.reduce((s, h) => s + h.deaths, 0);
  return { n: hs.length, hours: round(hrs, 1), xp: round(w((h) => h.levelXpPerH), 0), income: round(w((h) => h.incomePerH), 0), store: round(w((h) => h.storePerH), 0), net: round(w((h) => h.profitPerH), 0),
    rares: round(w((h) => h.raresPerH), 0), kills: c.party.killsPerH, ttk: c.party.ttkS.p50, dps: round(w((h) => h.dps), 1), taken: round(w((h) => h.takenPerH), 0), deaths, close,
    hpP50: Math.min(...hs.map((h) => h.encMinHpPct.p50 ?? 100)), hpP10: Math.min(...hs.map((h) => h.encMinHpPct.p10 ?? 100)), hpP01: Math.min(...hs.map((h) => h.encMinHpPct.p01 ?? 100)), heroes: hs.map((h) => [h.style, h.levelXpPerH, h.profitPerH, h.encMinHpPct.p50, h.deaths]) };
}
const find = (list, o) => list.find((c) => c.ground === o.ground && key(c.cell.party) === key(o.party) && c.cell.level === o.level && dens(c) === (o.density || 0)
  && !!starter(c) === !!o.starter && (offset(c) || null) === (o.only || null) && (!o.x || stage(c) === o.x));
const pad = (s, n) => String(s).padEnd(n), lp = (s, n) => String(s).padStart(n);
const pct = (a, b) => (b ? round(a / b, 2) : null);
const out = { meta: { generated: new Date().toISOString(), cells: cells.length, careers: careers.length, whatIf: what.length, heroHours: round(cells.reduce((s, c) => s + c.heroes.reduce((a, h) => a + h.hours, 0), 0), 0) } };

/* ── 1. ABOVE YOUR LEVEL ── against the ground that holds the Level, same party, gear and pull */
function reach() {
  console.log('\n== 1. ABOVE YOUR LEVEL (per head per hour; ratio = against the fitting ground, same party, gear, pull) ==');
  const FIT = { 7: 'meadowbrook_thicket', 12: 'wickstead', 25: 'mosslight_glade' };
  const rows = [];
  for (const c of cells.filter((x) => stage(x) === 'R')) {
    const r = read(c), L = c.cell.level;
    const fit = find(cells, { ground: FIT[L], party: c.cell.party, level: L, density: dens(c), starter: starter(c), x: 'R' });
    const f = fit ? read(fit) : null;
    rows.push({ L, ground: c.ground, party: key(c.cell.party), kit: starter(c) ? 'practice' : 'level', pull: dens(c), hours: r.hours, xp: r.xp, xpRatio: f ? pct(r.xp, f.xp) : null, income: r.income, store: r.store, net: r.net, netRatio: f ? pct(r.net, f.net) : null, deaths: r.deaths, close: r.close, hpP50: r.hpP50, hpP10: r.hpP10 });
  }
  rows.sort((a, b) => a.L - b.L || a.party.localeCompare(b.party) || a.kit.localeCompare(b.kit) || a.pull - b.pull || a.ground.localeCompare(b.ground));
  console.log('  L  party                 kit      pull ground     hrs     xp/h  xRatio   inc  store    net nRatio dead close  hp50  hp10');
  for (const r of rows) console.log(' ' + lp(r.L, 2) + '  ' + pad(r.party, 21) + ' ' + pad(r.kit, 8) + ' ' + lp(r.pull, 3) + '  ' + pad(SHORT[r.ground], 10) + lp(r.hours, 4) + lp(r.xp, 9) + lp(r.xpRatio, 7) + lp(r.income, 7) + lp(r.store, 7) + lp(r.net, 7) + lp(r.netRatio, 7) + lp(r.deaths, 4) + lp(r.close, 5) + lp(r.hpP50, 7) + lp(r.hpP10, 6));
  out.reach = rows;
}

/* ── 2. DANGER IN BAND ── pooled by ground, way to fight, pull, kit */
function danger() {
  console.log('\n== 2. DANGER IN BAND (solo; typical = median of cells\' median lowest HP per encounter; worst = lowest worst-tenth) ==');
  const rows = [];
  /* every in-band lone-hero cell played at today's numbers: x=D, the candidates' x=W0, the parties' lone heroes, the upgrade steps' rung */
  const inBand = (c) => c.hunt.band && c.cell.level >= c.hunt.band[0] && c.cell.level <= c.hunt.band[1];
  const D = cells.concat(what.filter((c) => stage(c) === 'W0')).filter((c) => c.cell.party.length === 1 && inBand(c) && !offset(c) && !['DD', 'R'].includes(stage(c)));
  const groups = {};
  for (const c of D) { const k = [c.ground, c.cell.party[0], dens(c), starter(c) ? 'practice' : 'level'].join('|'); (groups[k] = groups[k] || []).push(c); }
  for (const [k, list] of Object.entries(groups)) {
    const [ground, style, pull, kit] = k.split('|');
    const rs = list.map(read), hours = rs.reduce((s, r) => s + r.hours, 0), deaths = rs.reduce((s, r) => s + r.deaths, 0), close = rs.reduce((s, r) => s + r.close, 0);
    const med = rs.map((r) => r.hpP50).sort((a, b) => a - b)[Math.floor((rs.length - 1) / 2)];
    rows.push({ ground, style, pull: Number(pull), kit, hours: round(hours, 0), typical: med, worst10: Math.min(...rs.map((r) => r.hpP10)), deaths, per1000: rateCI(deaths, hours, 1000), closePer12: round((close / hours) * 12, 2), store: round(rs.reduce((s, r) => s + r.store * r.hours, 0) / hours, 0), net: round(rs.reduce((s, r) => s + r.net * r.hours, 0) / hours, 0) });
  }
  const O = ['mill_cellar', 'meadowbrook_thicket', 'wickstead', 'mosslight_glade'];
  rows.sort((a, b) => O.indexOf(a.ground) - O.indexOf(b.ground) || a.kit.localeCompare(b.kit) || a.pull - b.pull || a.style.localeCompare(b.style));
  console.log('  ground     kit      pull style    hrs  typical worst10 dead  /1000h(hi) close/12h store    net');
  for (const r of rows) console.log('  ' + pad(SHORT[r.ground], 10) + ' ' + pad(r.kit, 8) + lp(r.pull, 4) + ' ' + pad(r.style, 8) + lp(r.hours, 3) + lp(r.typical, 9) + lp(r.worst10, 8) + lp(r.deaths, 5) + lp(r.per1000.hi, 11) + lp(r.closePer12, 10) + lp(r.store, 6) + lp(r.net, 7));
  const pool = (f) => { const x = rows.filter(f), h = x.reduce((s, r) => s + r.hours, 0), d = x.reduce((s, r) => s + r.deaths, 0); return { hours: h, deaths: d, per1000: rateCI(d, h, 1000), typicalRange: [Math.min(...x.map((r) => r.typical)), Math.max(...x.map((r) => r.typical))] }; };
  const pooled = { levelAsBuilt: pool((r) => r.kit === 'level' && r.pull === 0), levelBox: pool((r) => r.kit === 'level' && r.pull === 8), practiceAsBuilt: pool((r) => r.kit === 'practice' && r.pull === 0), practiceBox: pool((r) => r.kit === 'practice' && r.pull === 8) };
  console.log('  pooled', JSON.stringify(pooled));
  const deep = cells.filter((c) => stage(c) === 'DD').map((c) => { const r = read(c); return { id: c.id, hours: r.hours, deaths: r.deaths, per1000: rateCI(r.deaths, r.hours, 1000), close: r.close, closePer12: round((r.close / r.hours) * 12, 2), hp: [r.hpP50, r.hpP10, r.hpP01], store: r.store, net: r.net }; });
  for (const d of deep) console.log('  deep', JSON.stringify(d));
  const parties = cells.filter((c) => stage(c) === 'D' && c.cell.party.length > 1).map((c) => { const r = read(c); return { ground: c.ground, L: c.cell.level, party: key(c.cell.party), hours: r.hours, xp: r.xp, net: r.net, store: r.store, deaths: r.deaths, close: r.close, hpP50: r.hpP50, hpP10: r.hpP10 }; });
  for (const p of parties) console.log('  party', JSON.stringify(p));
  out.danger = { rows, pooled, deep, parties };
}

/* ── 5a. PARTIES ── per head, against the same heroes alone on the same ground, Level and dice */
function parties() {
  console.log('\n== 5a. PARTIES (Level XP per head against the same heroes alone: asBuilt = alone as built; samePull = alone at the same pick) ==');
  const P = cells.filter((c) => stage(c) === 'P');
  const rows = [];
  for (const c of P.filter((x) => x.cell.party.length > 1)) {
    const lone = (d) => { const ls = c.cell.party.map((s) => find(P, { ground: c.ground, party: [s], level: c.cell.level, density: d })); return ls.every(Boolean) ? ls.map(read) : null; };
    const mean = (ls, k) => (ls ? ls.reduce((s, r) => s + r[k], 0) / ls.length : null);
    const r = read(c), a = lone(0), b = lone(dens(c));
    const same = new Set(c.cell.party.map((s) => (s === 'hammer' || s === 'tank' ? 'melee' : s))).size === 1;
    rows.push({ ground: c.ground, L: c.cell.level, party: key(c.cell.party), size: c.cell.party.length, same, pull: dens(c), hours: r.hours, xp: r.xp, vsAsBuilt: pct(r.xp, mean(a, 'xp')), vsSamePull: pct(r.xp, mean(b, 'xp')), net: r.net, netVsAsBuilt: pct(r.net, mean(a, 'net')), deaths: r.deaths, hpP50: r.hpP50 });
  }
  const O = ['meadowbrook_thicket', 'wickstead', 'mosslight_glade', 'millrace_sewer', 'coppercap_warrens'];
  rows.sort((a, b) => O.indexOf(a.ground) - O.indexOf(b.ground) || a.pull - b.pull || a.same - b.same || a.size - b.size);
  console.log('  ground     L pull party                 hrs     xp/h vsBuilt vsSame    net netVs dead  hp50');
  for (const r of rows) console.log('  ' + pad(SHORT[r.ground], 10) + lp(r.L, 2) + lp(r.pull, 4) + ' ' + pad(r.party, 22) + lp(r.hours, 3) + lp(r.xp, 9) + lp(r.vsAsBuilt, 8) + lp(r.vsSamePull, 7) + lp(r.net, 7) + lp(r.netVsAsBuilt, 6) + lp(r.deaths, 5) + lp(r.hpP50, 6));
  out.parties = rows;
  const solo = P.filter((x) => x.cell.party.length === 1).map((c) => { const r = read(c); return { ground: c.ground, style: c.cell.party[0], L: c.cell.level, pull: dens(c), xp: r.xp, net: r.net, store: r.store, hp: r.hpP50 }; });
  out.partySolo = solo;
}

/* ── 5b. ONE UPGRADE STEP ── everything else equal, same dice */
function upgrades() {
  console.log('\n== 5b. ONE TIER STEP (the rung against one tier behind; §8 weapon +5-8%, §9 armor 3-5% less taken) ==');
  const W = cells.filter((c) => stage(c) === 'W');
  const rows = [];
  for (const c of W.filter((x) => !x.cell.gear)) {
    const r = read(c);
    for (const only of ['weapon', 'armour']) {
      const b = find(W, { ground: c.ground, party: c.cell.party, level: c.cell.level, density: dens(c), only });
      if (!b) continue;
      const x = read(b);
      rows.push({ L: c.cell.level, ground: c.ground, style: c.cell.party[0], only, pull: dens(c), hours: r.hours, kit: [b.heroes[0].kit.weapon, c.heroes[0].kit.weapon], killsGain: pct(r.kills, x.kills), xpGain: pct(r.xp, x.xp), netGain: pct(r.net, x.net), takenChange: pct(r.taken, x.taken), storeFrom: x.store, storeTo: r.store, dpsGain: pct(r.dps, x.dps), ttk: r.ttk });
    }
  }
  rows.sort((a, b) => a.L - b.L || a.only.localeCompare(b.only) || a.pull - b.pull || a.style.localeCompare(b.style));
  console.log('   L only   pull style    weapon from-to                     kills   xp    net  taken  dps  store from-to  ttk');
  for (const r of rows) console.log(' ' + lp(r.L, 3) + ' ' + pad(r.only, 7) + lp(r.pull, 3) + ' ' + pad(r.style, 8) + pad(r.kit.join('>'), 34) + lp(r.killsGain, 6) + lp(r.xpGain, 6) + lp(r.netGain, 6) + lp(r.takenChange, 6) + lp(r.dpsGain, 6) + lp(r.storeFrom, 6) + '>' + lp(r.storeTo, 5) + lp(r.ttk, 5));
  out.upgrades = rows;
}

/* ── 3. GOLD ── what a life earns, hours to Levels, against the ruling's hours and the sinks */
function lives() {
  console.log('\n== 3. LIVES (hours to Levels, gold by hour; target L10 6 h, L25 36 h; gold = income less store, rares apart) ==');
  const rows = [];
  for (const c of careers) {
    const seats = c.party.length;
    const hoursTo = {};
    for (const L of [5, 8, 10, 15, 16, 20, 25, 30, 32, 40]) { const v = c.party.map((_, i) => c.milestones[i + ':' + L]).filter((x) => x !== undefined); if (v.length) hoursTo[L] = round(v.reduce((a, b) => a + b, 0) / v.length, 1); }
    let t = 0, gold = 0, rare = 0, coin = 0, store = 0, deaths = 0;
    const goldAt = {}, levelAt = {};
    for (const x of c.trace) {
      const h = x.hours - t; t = x.hours;
      gold += x.profitPerH.reduce((a, b) => a + b, 0) * h;
      rare += x.netPerH ? (x.netPerH.reduce((a, b) => a + b, 0) - x.profitPerH.reduce((a, b) => a + b, 0)) * h : 0;
      coin += x.coinPerH ? x.coinPerH.reduce((a, b) => a + b, 0) * h : 0;
      store += x.storePerH ? x.storePerH.reduce((a, b) => a + b, 0) * h : 0;
      deaths += x.deaths.reduce((a, b) => a + b, 0);
      for (const m of [1, 5, 12, 20, 30, 45]) if (t <= m + 1e-9) { goldAt[m] = Math.round(gold / seats); levelAt[m] = Math.round(x.levels.reduce((a, b) => a + b, 0) / seats); }
    }
    rows.push({ id: c.id, hours: c.hours, reached: c.reached, hoursTo, goldAt, levelAt, perHead: { gold: Math.round(gold / seats), rare: Math.round(rare / seats), coin: Math.round(coin / seats), store: Math.round(store / seats) }, deaths, path: [...new Set(c.trace.map((x) => SHORT[x.ground]))] });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  for (const r of rows) console.log('  ' + pad(r.id, 18) + ' to ' + JSON.stringify(r.hoursTo) + '\n     gold@h ' + JSON.stringify(r.goldAt) + ' level@h ' + JSON.stringify(r.levelAt) + ' ' + JSON.stringify(r.perHead) + ' deaths ' + r.deaths + ' ' + r.path.join('>'));
  out.lives = rows;
}

/* ── THE CANDIDATES ── each against today on the same dice */
function candidates() {
  if (!what.length) return;
  console.log('\n== CANDIDATES (each what-if against x=W0, same cell, same dice) ==');
  const rows = [];
  for (const c of what.filter((x) => stage(x) !== 'W0')) {
    const base = find(what, { ground: c.ground, party: c.cell.party, level: c.cell.level, density: dens(c), only: offset(c), x: 'W0' });
    if (!base) continue;
    const r = read(c), b = read(base);
    rows.push({ v: stage(c), ground: c.ground, L: c.cell.level, party: key(c.cell.party), pull: dens(c), only: offset(c), hours: r.hours, xp0: b.xp, xp: r.xp, xpR: pct(r.xp, b.xp), kills: pct(r.kills, b.kills), net0: b.net, net: r.net, store0: b.store, store: r.store, hp0: b.hpP50, hp: r.hpP50, hp10: r.hpP10, deaths: r.deaths, close: r.close });
  }
  const O = ['W0', 'Hx2', 'Hx3', 'Hx2B', 'Hx3B'];
  rows.sort((a, b) => O.indexOf(a.v) - O.indexOf(b.v) || a.ground.localeCompare(b.ground) || a.L - b.L || a.pull - b.pull || a.party.localeCompare(b.party));
  console.log('  var  ground     L pull party                 hrs   xp/h was>now  xpR kills  net was>now store was>now  hp50 was>now hp10 dead close');
  for (const r of rows.filter((x) => !x.only)) console.log('  ' + pad(r.v, 5) + pad(SHORT[r.ground], 10) + lp(r.L, 2) + lp(r.pull, 4) + ' ' + pad(r.party, 22) + lp(r.hours, 3) + lp(r.xp0, 7) + '>' + lp(r.xp, 6) + lp(r.xpR, 6) + lp(r.kills, 6) + lp(r.net0, 7) + '>' + lp(r.net, 6) + lp(r.store0, 6) + '>' + lp(r.store, 6) + lp(r.hp0, 7) + '>' + lp(r.hp, 5) + lp(r.hp10, 6) + lp(r.deaths, 4) + lp(r.close, 5));
  /* the weapon step under each variant: the rung against one tier behind, same variant */
  console.log('  -- weapon step at L16 under each variant (kills, XP) --');
  const steps = [];
  for (const v of O) for (const s of ['tank', 'hammer', 'bow', 'mage']) for (const d of [0, 8]) {
    const hi = what.find((c) => stage(c) === v && c.ground === 'wickstead' && c.cell.level === 16 && key(c.cell.party) === s && dens(c) === d && !offset(c));
    const lo = what.find((c) => stage(c) === v && c.ground === 'wickstead' && c.cell.level === 16 && key(c.cell.party) === s && dens(c) === d && offset(c) === 'weapon');
    if (!hi || !lo) continue;
    const a = read(hi), b = read(lo);
    steps.push({ v, style: s, pull: d, kills: pct(a.kills, b.kills), xp: pct(a.xp, b.xp), net: pct(a.net, b.net), ttk: a.ttk });
    console.log('  ' + pad(v, 5) + pad(s, 8) + lp(d, 2) + '  kills x' + pct(a.kills, b.kills) + '  xp x' + pct(a.xp, b.xp) + '  net x' + pct(a.net, b.net) + '  ttk ' + a.ttk);
  }
  out.candidates = rows;
  out.weaponUnderCandidates = steps;
}

/* ── THE LEVEL-GAP TERM ── every monster's atk x (1 + k per Level under the floor), against the same cell as built */
function gapTerm() {
  if (!gaps.length) return;
  console.log('\n== LEVEL-GAP TERM (atk x (1 + k x Levels under the floor), against today, same dice) ==');
  const rows = [];
  for (const c of gaps) {
    const base = find(cells, { ground: c.ground, party: c.cell.party, level: c.cell.level, x: 'R' });
    const r = read(c), b = base ? read(base) : null;
    rows.push({ k: stage(c), ground: c.ground, L: c.cell.level, party: key(c.cell.party), hours: r.hours, xp0: b && b.xp, xp: r.xp, net0: b && b.net, net: r.net, store0: b && b.store, store: r.store, hp0: b && b.hpP50, hp: r.hpP50, hp10: r.hpP10, deaths: r.deaths, close: r.close });
  }
  rows.sort((a, b) => a.ground.localeCompare(b.ground) || a.L - b.L || a.party.localeCompare(b.party) || parseInt(a.k.slice(1), 10) - parseInt(b.k.slice(1), 10));
  for (const r of rows) console.log('  ' + pad(r.k, 4) + pad(SHORT[r.ground], 9) + lp(r.L, 2) + ' ' + pad(r.party, 22) + lp(r.hours, 3) + ' xp ' + r.xp0 + '>' + r.xp + ' net ' + r.net0 + '>' + r.net + ' store ' + r.store0 + '>' + r.store + ' hp ' + r.hp0 + '>' + r.hp + ' (' + r.hp10 + ') dead ' + r.deaths + ' close ' + r.close);
  out.gapTerm = rows;
}

/* ── 4. THE WAGE ── played on the local world, tax out of the purse */
function wage() {
  if (!craft) return;
  console.log('\n== 4. THE WAGE AFTER TAX (played on the local world, ' + craft.samples + ' samples, ' + craft.hours + ' h a row) ==');
  const hunts = craft.hunts || [];
  for (const h of hunts) console.log('  hunt ' + pad(h.ground, 22) + 'L' + h.level + ' ' + h.role + ': ' + h.netPerH + ' g/h (coin ' + h.coinPerH + ' + loot ' + h.lootPerH + ') samples ' + (h.samples || []).join('/'));
  for (const c of craft.chains || []) console.log('  chain ' + pad(c.name, 22) + c.samples.map((s) => s.gold + ' g, tax ' + s.tax + ', ' + round(s.hours, 2) + ' h, ' + (s.perH ?? '-') + ' > ' + s.afterTaxPerH + ' g/h').join(' | '));
  const rows = (craft.bench || []).filter((r) => r.jobsPerH).map((r) => ({ skill: r.skill, id: r.id, req: r.req, jobsPerH: r.jobsPerH, soldPerH: r.soldPerH, taxPerH: r.taxPerH, inBid: r.inBidPerJob, netFromStock: r.netFromStockPerH, unit: r.outUnit, taxShare: r.soldPerH ? round(r.taxPerH / r.soldPerH, 3) : null }));
  rows.sort((a, b) => b.netFromStock - a.netFromStock);
  console.log('  -- best from stock after tax (inputs at their shop bid) --');
  for (const r of rows.slice(0, 25)) console.log('  ' + pad(r.skill, 13) + pad(r.id, 26) + 'L' + lp(r.req, 2) + lp(r.jobsPerH, 6) + ' jobs/h sold ' + lp(r.soldPerH, 7) + ' tax ' + lp(r.taxPerH, 6) + ' net ' + lp(r.netFromStock, 7));
  out.wage = { hunts, chains: craft.chains, gather: craft.gather, bench: rows, rooms: craft.rooms };
}

reach(); danger(); parties(); upgrades(); lives(); candidates(); gapTerm(); wage();
if (process.argv.includes('--write')) { writeFileSync(join(HERE, 'b1120-summary.json'), JSON.stringify(out) + '\n'); console.log('\nwrote tools/balance-sim/b1120-summary.json'); }
