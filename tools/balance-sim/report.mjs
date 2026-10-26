#!/usr/bin/env node
// tools/balance-sim/report.mjs — THE BASELINE REPORT from a simulator run (today's game vs Tyler's balance ruling).
//
//   node tools/balance-sim/report.mjs [--in tools/balance-sim/out/baseline] [--summary tools/balance-sim/baseline-summary.json]
//
// Reads the run's cells.jsonl and writes, beside it: dashboard.json (one flat row per hero per cell: ground x style x
// Level x party x density x variant, the shape a filterable Dashboard artifact reads) and cells.csv (the same rows);
// and the COMMITTED summary (--summary): the ruling's targets against the measured game, every table the report
// quotes. Prints the tables. Every measured number comes from the run; the only arithmetic here is aggregation,
// interpolation and the stated extrapolation past the last ground (Level 50), labelled as such wherever it is used.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { round } from './stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const IN = resolve(arg('in', join(HERE, 'out', 'baseline')));
const SUMMARY = resolve(arg('summary', join(HERE, 'baseline-summary.json')));

/* THE RULING'S TARGETS (Tyler 2026-10-25, balance ruling §2, §3, §5, §8, §9) */
const TARGET_HOURS = [[1, 0], [10, 6], [25, 36], [50, 168], [100, 600], [200, 1680], [300, 3120], [500, 6720], [750, 13440], [1000, 23520]];
const PARTY_TARGET = { 2: [1.05, 1.15], 3: [1.10, 1.20], 4: [1.15, 1.25] };
const WEAPON_STEP = [0.05, 0.08], ARMOUR_STEP = [0.03, 0.05];
const MILESTONES = [10, 25, 50, 100, 200, 300, 500, 750, 1000];

const u = (p) => pathToFileURL(join(ROOT, p)).href;
const { BUILD } = await import(u('src/build-info.js'));
const XP = await import(u('src/core/xp.js') + '?v=' + BUILD.version);
const AR = await import(u('src/core/action-rules.js') + '?v=' + BUILD.version);
const { BLESSING_TIERS, blessingPrice } = await import(u('src/data/blessings.js'));
const { LEVEL_CURVE } = await import(u('src/data/core-model.js'));

const rows = existsSync(join(IN, 'cells.jsonl')) ? readFileSync(join(IN, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const careers = rows.filter((r) => r.kind === 'career');
const cells = rows.filter((r) => r.kind !== 'career' && r.heroes);
const stage = (c) => ((c.id.match(/x=(S\d)/) || [])[1] || (c.id.includes('x=cost') ? 'cost' : 'S?'));
const styleKey = (c) => c.cell.party.join('+');
const dens = (c) => (Number.isInteger(c.cell.density) ? c.cell.density : 0);
const variant = (c) => (c.cell.gear ? JSON.stringify(c.cell.gear) : '') + (c.cell.bar ? JSON.stringify(c.cell.bar) : '') + (c.cell.supply ? 'supply:' + c.cell.supply : '');
const plain = (c) => !variant(c);
const meanXp = (c) => c.party.levelXpPerHeroPerH;
/* A cell a player can farm: nobody died in it and close calls stayed at or under the ruling's one per 12 h */
const safe = (c) => c.heroes.every((h) => h.deaths === 0 && (h.closeCallsPer12h.rate || 0) <= 1);

/* ── 1. LEVEL XP AN HOUR BY LEVEL (skills at the hero's Level), the efficient pick per Level ─────────────── */
function xpCurve(style) {
  /* per ground and density: [L, xp/h] sampled; efficient = the best safe sample at each Level, interpolated */
  const series = {};
  for (const c of cells) {
    if (c.cell.party.length !== 1 || c.cell.party[0] !== style || !plain(c) || !/S2|S3/.test(stage(c))) continue;
    if (!safe(c)) continue;
    const k = c.ground + '@' + dens(c);
    (series[k] = series[k] || []).push([c.cell.level, meanXp(c)]);
  }
  for (const k of Object.keys(series)) series[k].sort((a, b) => a[0] - b[0]);
  const at = (L) => {
    let best = null, where = null;
    for (const [k, s] of Object.entries(series)) {
      if (L < s[0][0] || L > s[s.length - 1][0]) continue;
      let y = s[0][1];
      for (let i = 1; i < s.length; i++) if (L <= s[i][0]) { const [x0, y0] = s[i - 1], [x1, y1] = s[i]; y = y0 + ((y1 - y0) * (L - x0)) / Math.max(1, x1 - x0); break; }
      if (best === null || y > best) { best = y; where = k; }
    }
    return { xp: best, where };
  };
  return { series, at };
}

/* A power law xp/h = a L^b fitted (log-log least squares) over measured Levels >= 10: THE EXTRAPOLATION past Level 50 */
function fitPower(pts) {
  const p = pts.filter(([L, y]) => L >= 10 && y > 0);
  if (p.length < 2) return null;
  const xs = p.map(([L]) => Math.log(L)), ys = p.map(([, y]) => Math.log(y));
  const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  const b = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return { a: Math.exp(my - b * mx), b };
}

const dXp = (curve, L) => curve(L + 1) - curve(L);
const curveOf = (q, c, s, l) => (L) => { const n = L - 1; return q * n ** 4 + c * n ** 3 + s * n ** 2 + l * n; };
const TODAY = curveOf(LEVEL_CURVE.quartic, LEVEL_CURVE.cubic, 0, LEVEL_CURVE.linear);
/* hours from Level 1 to each milestone on `curve` at xp/h `rate(L)` */
function hoursTable(curve, rate) {
  const out = {};
  let h = 0, L = 1;
  for (const m of MILESTONES) { for (; L < m; L++) h += dXp(curve, L) / Math.max(1, rate(L)); out[m] = round(h, 1); }
  return out;
}
const targetAt = (L) => {
  for (let i = 1; i < TARGET_HOURS.length; i++) {
    const [x0, y0] = TARGET_HOURS[i - 1], [x1, y1] = TARGET_HOURS[i];
    if (L <= x1) {
      if (y0 <= 0) return (y1 * (L - x0)) / (x1 - x0);
      const t = Math.log(L / x0) / Math.log(x1 / x0);
      return Math.exp(Math.log(y0) + t * (Math.log(y1) - Math.log(y0)));
    }
  }
  return TARGET_HOURS[TARGET_HOURS.length - 1][1];
};

function levelHours() {
  const styles = [...new Set(cells.filter((c) => c.cell.party.length === 1).map((c) => c.cell.party[0]))];
  const per = {};
  const allPts = [];
  for (const s of styles) {
    const cv = xpCurve(s);
    const pts = [];
    for (let L = 1; L <= 55; L++) { const v = cv.at(L); if (v.xp !== null) pts.push([L, v.xp, v.where]); }
    if (!pts.length) continue;
    const fit = fitPower(pts);
    const last = pts[pts.length - 1][0];
    const rate = (L) => { const v = pts.find((p) => p[0] === L); if (v) return v[1]; if (L < pts[0][0]) return pts[0][1]; return fit ? fit.a * L ** fit.b : pts[pts.length - 1][1]; };
    /* TODAY'S CONTENT: past the last ground the hero keeps its best last ground's rate (no ground beyond it) */
    const flat = (L) => (L <= last ? rate(L) : pts[pts.length - 1][1]);
    per[s] = { measuredTo: last, fit: fit ? { a: round(fit.a, 1), b: round(fit.b, 3) } : null,
      xpPerH: Object.fromEntries([5, 10, 15, 20, 25, 30, 35, 40, 45, 50].filter((L) => L <= last).map((L) => [L, round(rate(L), 0)])),
      where: Object.fromEntries([5, 10, 15, 20, 25, 30, 35, 40, 45, 50].filter((L) => L <= last).map((L) => [L, (pts.find((p) => p[0] === L) || [])[2] || null])),
      hoursTrend: hoursTable(TODAY, rate), hoursTodayContent: hoursTable(TODAY, flat) };
    for (const p of pts) allPts.push(p);
  }
  return per;
}

/* ── 2. THE PROPOSED LEVEL CURVE: XP per Level = the ruling's hours for that Level x the measured (then extrapolated) rate ── */
function proposeCurve(rate) {
  const want = (L) => (targetAt(L + 1) - targetAt(L)) * rate(L);
  const cum = [0, 0];
  for (let L = 1; L <= 1000; L++) cum[L + 1] = cum[L] + want(L);
  /* integer coefficients of the form the engine and its SQL twin already carry (quartic, cubic, linear), plus the
     variant with a quadratic term (a code change in src/core/xp.js and the generated limits row); log-error fit */
  const err = (f) => { let e = 0; for (const L of MILESTONES) { const t = Math.log(Math.max(1, f(L))) - Math.log(Math.max(1, cum[L])); e += t * t; } return e; };
  let best3 = null;
  for (let q = 0; q <= 2; q++) for (let c = 0; c <= 400; c += 1) for (const l of [0, 25, 50, 100, 200, 400, 800, 1600]) {
    const f = curveOf(q, c, 0, l), e = err(f);
    if (!best3 || e < best3.e) best3 = { q, c, s: 0, l, e };
  }
  let best4 = null;
  for (let c = 0; c <= 200; c += 1) for (let s = 0; s <= 3000; s += 25) for (const l of [0, 50, 100, 200, 400, 800, 1600, 3200]) {
    const f = curveOf(0, c, s, l), e = err(f);
    if (!best4 || e < best4.e) best4 = { q: 0, c, s, l, e };
  }
  const table = (f) => Object.fromEntries(MILESTONES.map((L) => [L, round(hoursTable(f, rate)[L], 0)]));
  return { ideal: Object.fromEntries(MILESTONES.map((L) => [L, Math.round(cum[L])])),
    threeTerm: { coeffs: { quartic: best3.q, cubic: best3.c, linear: best3.l }, hours: table(curveOf(best3.q, best3.c, 0, best3.l)) },
    withQuadratic: { coeffs: { cubic: best4.c, quadratic: best4.s, linear: best4.l }, hours: table(curveOf(0, best4.c, best4.s, best4.l)) },
    today: { coeffs: LEVEL_CURVE, hours: table(TODAY) },
    target: Object.fromEntries(MILESTONES.map((L) => [L, targetAt(L)])) };
}

/* ── 3. DIFFICULTY BANDS per ground and Level offset ───────────────────────────────────────────────────── */
function bands() {
  const out = [];
  for (const c of cells) {
    if (c.cell.party.length !== 1 || !plain(c) || !/S2|S3|S7/.test(stage(c))) continue;
    const h = c.heroes[0], b = c.hunt.band || [0, 0];
    const off = c.cell.level < b[0] ? c.cell.level - b[0] : c.cell.level > b[1] ? c.cell.level - b[1] : 0;
    out.push({ ground: c.ground, style: h.style, level: c.cell.level, density: dens(c), offset: off, hours: h.hours,
      minHpP50: h.encMinHpPct.p50, minHpP10: h.encMinHpPct.p10, deaths: h.deaths, deathsPer1000h: h.deathsPer1000h,
      closePer12h: h.closeCallsPer12h, band: h.band, xpPerH: h.levelXpPerH, profitPerH: h.profitPerH, killers: h.killers });
  }
  return out;
}

/* ── 4. PARTY vs SOLO, per character ──────────────────────────────────────────────────────────────────── */
function partyVsSolo() {
  const out = [];
  const solo = (g, s, L, d) => cells.find((c) => c.ground === g && c.cell.party.length === 1 && c.cell.party[0] === s && c.cell.level === L && dens(c) === d && plain(c));
  for (const c of cells) {
    if (c.cell.party.length < 2 || !plain(c) || !/S4|S7/.test(stage(c))) continue;
    const L = c.cell.level, d = dens(c);
    const same = c.cell.party.map((s) => solo(c.ground, s, L, d)).filter(Boolean);
    const sameMean = same.length === c.cell.party.length ? same.reduce((t, x) => t + meanXp(x), 0) / same.length : null;
    /* the efficient solo: the best SAFE solo cell at this Level anywhere (any ground, style, density) */
    const eff = cells.filter((x) => x.cell.party.length === 1 && x.cell.level === L && plain(x) && safe(x)).sort((a, b) => meanXp(b) - meanXp(a))[0] || null;
    const n = c.cell.party.length, per = meanXp(c);
    const heroes = c.heroes.map((h) => ({ style: h.style, xpPerH: h.levelXpPerH, incomePerH: h.incomePerH, storePerH: h.storePerH, profitPerH: h.profitPerH, deaths: h.deaths }));
    const incomeAll = heroes.reduce((t, h) => t + h.incomePerH, 0), storeAll = heroes.reduce((t, h) => t + h.storePerH, 0);
    out.push({ ground: c.ground, party: styleKey(c), size: n, level: L, density: d, hours: c.party.hours, xpPerHero: per,
      vsSameGroundSolo: sameMean ? round(per / sameMean, 3) : null, sameGroundSoloXp: sameMean ? round(sameMean, 0) : null,
      vsEfficientSolo: eff ? round(per / meanXp(eff), 3) : null, efficientSolo: eff ? { id: eff.id, xp: meanXp(eff) } : null,
      target: PARTY_TARGET[n] || null, heroes, rareRolls: c.party.rareRolls, rareWins: c.party.rareWins, rareGini: c.party.rareGini,
      /* gold: created by the hunt (coin + loot at the vendor's bid), destroyed (store supplies); per controlling player
         when one player runs all of them (one account purse); Mode B (shared) would move each hero to the party mean */
      createdPerH: c.party.createdPerH, destroyedPerH: c.party.destroyedPerH, accountNetPerH: round(incomeAll - storeAll, 0),
      modeBTransfersPerH: heroes.map((h) => round((incomeAll - storeAll) / n - h.profitPerH, 0)) });
  }
  return out;
}

/* ── 5. UPGRADE STEPS (weapon: measured hunting performance; armour: incoming damage) ───────────────────── */
function upgrades() {
  const out = [];
  const base = cells.filter((c) => stage(c) === 'S5' && !c.cell.gear);
  for (const b of base) {
    const h0 = b.heroes[0];
    for (const only of ['weapon', 'armour', 'body']) {
      const v = cells.find((c) => stage(c) === 'S5' && c.cell.gear && c.cell.gear.only === only && c.ground === b.ground && c.cell.level === b.cell.level
        && c.cell.party[0] === b.cell.party[0] && dens(c) === dens(b));
      if (!v) continue;
      const h1 = v.heroes[0];
      const pct = (a, z) => (z ? round((a / z - 1) * 100, 1) : null);
      out.push({ style: h0.style, level: b.cell.level, ground: b.ground, density: dens(b), step: only,
        from: only === 'weapon' ? h1.kit.weapon : only === 'body' ? h1.kit.body : h1.kit.helmet, to: only === 'weapon' ? h0.kit.weapon : only === 'body' ? h0.kit.body : h0.kit.helmet,
        xpPerHGainPct: pct(h0.levelXpPerH, h1.levelXpPerH), killsPerHGainPct: pct(b.party.killsPerH, v.party.killsPerH), dpsGainPct: pct(h0.dps, h1.dps),
        profitPerHDelta: h0.profitPerH - h1.profitPerH, ttkP50: [v.party.ttkS.p50, b.party.ttkS.p50],
        takenPerSwingCutPct: h1.dmgPerMonsterSwing ? round((1 - h0.dmgPerMonsterSwing / h1.dmgPerMonsterSwing) * 100, 1) : null,
        takenPerHCutPct: h1.takenPerH ? round((1 - h0.takenPerH / h1.takenPerH) * 100, 1) : null,
        storePerHDelta: h0.storePerH - h1.storePerH, deaths: [h1.deaths, h0.deaths], hours: [h1.hours, h0.hours],
        target: only === 'weapon' ? WEAPON_STEP : ARMOUR_STEP });
    }
  }
  return out;
}

/* ── 6. HEALING AND SUSTAIN ───────────────────────────────────────────────────────────────────────────── */
function healing() {
  const out = [];
  for (const c of cells) {
    if (c.cell.party.length !== 1 || !/S3|S6/.test(stage(c))) continue;
    const h = c.heroes[0];
    out.push({ ground: c.ground, style: h.style, level: c.cell.level, density: dens(c), variant: variant(c) || 'reference bar, store food',
      takenPerH: h.takenPerH, healInPerH: h.healInPerH, regenSharePct: h.takenPerH ? round(100 * Math.max(0, 1 - h.healInPerH.total / h.takenPerH), 1) : null,
      sustainRatio: h.sustainRatio, eatsPerH: h.eatsPerH, storePerH: h.storePerH, profitPerH: h.profitPerH,
      deaths: h.deaths, minHpP10: h.encMinHpPct.p10, closePer12h: h.closeCallsPer12h.rate, band: h.band });
  }
  return out;
}

/* ── 7. WHAT AN UNBLESSED DEATH COSTS, in hunting hours at the measured (then extrapolated) rate ──────────── */
function deathCost(rate) {
  return [10, 25, 30, 50, 100, 200, 500, 1000].map((L) => {
    const x = XP.charXpForLevel(L), mid = x + Math.floor((XP.charXpForLevel(L + 1) - x) / 2);
    const lost = AR.levelDeathLoss(mid);
    const hrs = lost / Math.max(1, rate(L));
    const blessed = Object.fromEntries(BLESSING_TIERS.map((t) => [t.tier, { hours: round(hrs * (1 - t.xpLossReductionPermille / 1000), 2),
      gold: BLESSING_TIERS.filter((r) => r.tier <= t.tier).reduce((s, r) => s + blessingPrice(r.tier, L), 0) }]));
    return { level: L, xpLostMidLevel: lost, shareOfLevel: round(lost / (XP.charXpForLevel(L + 1) - x), 3), unblessedHours: round(hrs, 2), blessed, extrapolated: L > 50 };
  });
}

/* ── THE AUDIT (ruling §10): the facts the code holds today, read from the data at report time ─────────── */
async function audit() {
  const v = '?v=' + BUILD.version;
  const G = await import(u('src/data/hunt-grounds.js') + v);
  const { HUNT_INDEX } = await import(u('src/data/hunts.js') + v);
  const { MONSTERS } = await import(u('src/data/monsters.js') + v);
  const { COMBAT_BALANCE } = await import(u('src/core/combat.js') + v);
  const CM = await import(u('src/data/core-model.js') + v);
  const { HUNT_TUNING } = await import(u('src/data/hunt-tuning.js') + v);
  const { CONSUMABLE_RULES } = await import(u('src/data/consumables.js') + v);
  const SB = await import(u('src/data/supply-basics.js') + v);
  const HS = await import(u('src/data/hunt-sessions.js') + v);
  const GT = await import(u('src/data/gear-tiers.js') + v);
  const { loadGear } = await import('./gear.mjs');
  const gear = await loadGear(ROOT);
  const census = gear.gearCensus();
  const grounds = Object.values(G.OPEN_GROUNDS).map((g) => {
    const ids = [...new Set(g.pockets.flatMap((p) => (p.pack || []).concat(p.spawns).map((s) => s.monster)))];
    return { id: g.id, band: HUNT_INDEX[g.hunt].band, groupFit: g.groupFit, soloFrom: g.soloFrom || null, respawnS: g.respawnMs / 1000, pockets: g.pockets.length,
      monsters: ids.map((id) => { const m = MONSTERS[id]; return { id, level: m.level, tier: m.tier, hp: m.hp, atk: m.atk, def: m.def, xp: m.xp, xpPerHp: round(m.xp / m.hp, 2), boss: !!m.boss }; }) };
  });
  const reachTier = {};
  for (const r of census) {
    const k = r.slot === 'weapon' ? 'weapon:' + r.weaponType + (r.twoHanded ? ' 2H' : '') : r.slot === 'shield' ? 'offhand' : r.armourClass + ':' + r.slot;
    const x = reachTier[k] = reachTier[k] || { reachableTop: 0, rows: 0, unreachable: 0 };
    x.rows++; if (r.source) x.reachableTop = Math.max(x.reachableTop, r.reqLv || 0); else x.unreachable++;
  }
  return {
    contentCeiling: Math.max(...grounds.map((g) => g.band[1])), grounds,
    combat: { basicIntervalMs: COMBAT_BALANCE.tickMs, accuracy: '0.55 + (skill + gear accuracy - monster def x tier mult) x 0.01, clamp 0.15..0.95, x1.15 on weakness',
      maxHit: 'floor(0.35 skill + 0.6 gear strength + 2) - floor(0.03 monster def), x1.2 on weakness; blow = uniform 1..maxHit; Level adds nothing to damage',
      monsterHit: 'acc 0.5 + (atk - (Defense + shield/cape def)) x 0.02 clamp 0.05..0.85; maxHit atk x ' + JSON.stringify({ base: COMBAT_BALANCE.monsterAttackDamageScale, byTier: COMBAT_BALANCE.monsterDamageScaleByTier }),
      critCap: COMBAT_BALANCE.critCap, critMult: COMBAT_BALANCE.critMult },
    vitals: CM.VITALS, armourMitigation: CM.ARMOUR_MITIGATION, oocRegenPermillePerS: HUNT_TUNING.oocRegenPermillePerS,
    food: { rules: CONSUMABLE_RULES, store: SB.BASIC_SUPPLIES.filter((b) => b.kind === 'heal' || b.kind === 'mana').map((b) => ({ id: b.id, kind: b.kind, price: b.price,
      amount: b.heals || b.mana, perSecondAtLane: round((b.heals || b.mana) / (CONSUMABLE_RULES.laneMs / 1000), 1), goldPerPoint: round(b.price / (b.heals || b.mana), 3) })) },
    party: { scale: G.PARTY_SCALE, yieldBySize: [1, 2, 3, 4].map((n) => G.yieldPermille(n)), xpSplit: 'kill XP / living heroes x each hero\'s multiplier (xp-share.js; no party bonus)',
      gold: 'coin split evenly among heroes present, commons round-robin, rares by the 1-100 roll with rotation (party-split.js); store supplies paid by each hero (one purse per account)' },
    death: { loss: HS.DEATH_XP_LOSS, base: HS.DEATH_XP_BASE, blessings: BLESSING_TIERS }, stamina: HS.STAMINA_MAX_MS,
    gearTiers: GT.MATERIAL_TIERS.map((t) => ({ tier: t.tier, level: t.level })), gearReach: reachTier,
    gearRows: census.length, gearUnreachable: census.filter((r) => !r.source).length,
  };
}

/* ── THE DASHBOARD ROWS ──────────────────────────────────────────────────────────────────────────────── */
function dashboardRows() {
  const out = [];
  for (const c of cells) for (const h of c.heroes) {
    out.push({ cell: c.id, stage: stage(c), ground: c.ground, band: c.hunt.band, party: styleKey(c), partySize: c.cell.party.length, style: h.style,
      level: c.cell.level, density: dens(c), variant: variant(c) || null, hours: h.hours, levelXpPerH: h.levelXpPerH,
      skillXpPerH: h.skillXpPerH, incomePerH: h.incomePerH, raresPerH: h.raresPerH, storePerH: h.storePerH, profitPerH: h.profitPerH,
      margin: h.margin, killsPerH: c.party.killsPerH, ttkS: c.party.ttkS.p50, dps: h.dps, takenPerH: h.takenPerH, dmgPerMonsterSwing: h.dmgPerMonsterSwing,
      healInPerH: h.healInPerH.total, sustainRatio: h.sustainRatio, eatsPerH: h.eatsPerH.own + h.eatsPerH.store, drinksPerH: h.drinksPerH.own + h.drinksPerH.store,
      deaths: h.deaths, deathsPer1000h: h.deathsPer1000h, closePer12h: h.closeCallsPer12h, minHpP50: h.encMinHpPct.p50, minHpP10: h.encMinHpPct.p10,
      difficulty: h.band, rareEveryH: h.rareEveryH, maxHp: h.maxHp, mitigation: h.mit, kit: h.kit });
  }
  return out;
}

function csv(rs) {
  const cols = ['cell', 'stage', 'ground', 'party', 'partySize', 'style', 'level', 'density', 'variant', 'hours', 'levelXpPerH', 'incomePerH', 'raresPerH', 'storePerH',
    'profitPerH', 'margin', 'killsPerH', 'ttkS', 'dps', 'takenPerH', 'dmgPerMonsterSwing', 'healInPerH', 'sustainRatio', 'eatsPerH', 'drinksPerH', 'deaths', 'minHpP50', 'minHpP10', 'difficulty'];
  const q = (v) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(',')].concat(rs.map((r) => cols.map((k) => q(r[k])).join(','))).join('\n') + '\n';
}

/* ── RUN ──────────────────────────────────────────────────────────────────────────────────────────────── */
const lh = levelHours();
/* the reference rate for the curve and the death cost: the best style's efficient rate per Level (players optimise) */
const refStyle = Object.entries(lh).sort((a, b) => (b[1].xpPerH[30] || 0) - (a[1].xpPerH[30] || 0))[0];
const ref = refStyle ? (() => {
  const s = refStyle[1], fit = s.fit;
  const pts = Object.entries(s.xpPerH).map(([L, y]) => [Number(L), y]);
  return (L) => {
    if (L > s.measuredTo && fit) return fit.a * L ** fit.b;
    let y = pts.length ? pts[0][1] : 1;
    for (let i = 1; i < pts.length; i++) if (L <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; y = y0 + ((y1 - y0) * (L - x0)) / (x1 - x0); return y; }
    return fit ? fit.a * L ** fit.b : y;
  };
})() : null;
const careerOut = careers.map((c) => ({ id: c.id, party: c.party, hours: c.hours, reached: c.reached,
  hoursTo: Object.fromEntries([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((L) => [L, c.milestones['0:' + L] ?? null])),
  grounds: [...new Set(c.trace.map((t) => t.ground))], deaths: c.trace.reduce((s, t) => s + t.deaths.reduce((a, b) => a + b, 0), 0),
  skillsAt: Object.fromEntries([10, 25, 40, 50].map((L) => { const t = c.trace.find((x) => Math.min(...x.levels) >= L); return [L, t ? t.skills[0] : null]; })),
  profitPerHByLevel: Object.fromEntries([10, 25, 40, 50].map((L) => { const t = c.trace.find((x) => Math.min(...x.levels) >= L); return [L, t ? t.profitPerH[0] : null]; })) }));
const summary = {
  meta: { generated: new Date().toISOString(), commit: (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return null; } })(),
    version: BUILD.version, input: IN.replace(ROOT, '.').replace(/\\/g, '/'), cells: cells.length, careers: careers.length,
    simHours: round(cells.reduce((s, c) => s + c.party.hours * c.cell.party.length, 0), 0), cpuSeconds: round(rows.reduce((s, r) => s + (r.ms || 0), 0) / 1000, 0) },
  targets: { hours: Object.fromEntries(TARGET_HOURS.slice(1)), party: PARTY_TARGET, weaponStep: WEAPON_STEP, armourStep: ARMOUR_STEP,
    bands: { easy: '80-95% min HP, <=0.1 deaths/1000h', normal: '60-80%, <=1', hard: '35-60%, 10-30', extreme: '15-40%, 50-100' } },
  audit: await audit(),
  careers: careerOut,
  levelHours: lh,
  curve: ref ? { referenceStyle: refStyle[0], ...proposeCurve(ref) } : null,
  deathCost: ref ? deathCost(ref) : null,
  bands: bands(),
  party: partyVsSolo(),
  upgrades: upgrades(),
  healing: healing(),
};
const dash = { schema: 'hearthrise.balance-dashboard/1', generated: summary.meta.generated, commit: summary.meta.commit,
  dims: { ground: [...new Set(cells.map((c) => c.ground))], style: [...new Set(cells.flatMap((c) => c.cell.party))], party: [...new Set(cells.map(styleKey))],
    level: [...new Set(cells.map((c) => c.cell.level))].sort((a, b) => a - b), density: [...new Set(cells.map(dens))].sort((a, b) => a - b), stage: [...new Set(cells.map(stage))].sort() },
  rows: dashboardRows(), careers: careerOut, summary: { levelHours: summary.levelHours, curve: summary.curve, party: summary.party, upgrades: summary.upgrades, deathCost: summary.deathCost } };
if (existsSync(IN)) {
  writeFileSync(join(IN, 'dashboard.json'), JSON.stringify(dash));
  writeFileSync(join(IN, 'cells.csv'), csv(dash.rows));
}
writeFileSync(SUMMARY, JSON.stringify(summary, null, 1) + '\n');
console.log('balance-sim report: ' + cells.length + ' cells, ' + careers.length + ' careers, ' + summary.meta.simHours + ' hero-hours -> ' + SUMMARY.replace(ROOT, '.'));
