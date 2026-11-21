// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/atlas/cost.mjs — WHAT ONE SOURCE COSTS AT ONE CHECKPOINT: hunted hours, rested hours, gold, days, percentiles.
//
//   makePricer({ D, sources, rates, grid }) -> P
//     P.route(src, ctx)       { hunted, rested, gold, days, p10, p50, p90, limitDays, blank } for ONE unit of src.item
//     P.best(item, ctx, opts) the cheapest reachable route (by days) and the runner-up
//     P.netPerDay(ctx)        the buyer's own net gold a 12 h day (the account: party x hero), the best ground in band at that Level
//   ctx = { level, party, tier, gear (low | mid | bis), townH, luckHours, skill (town skill level; default the job's own req), stateOk (OPEN | STAGED) }
//
// THE ONE UNIT: days at the 12 hour day. A route's resources run side by side in a day (the hunted 12 hours, the party's rested hours, the
// purse), so a route's days are the MAX of hunted / 12, rested / (party x townH), gold / net gold a day, and its weekly or daily limit.
// Chance: a drop's hours are exponential (p10 0.105, p50 0.693, p90 2.303 of the mean); a chest's and a hall's are walked exactly.
// PURE. Labels travel with the source; a blank says why (no rate measured there, a planned row, an input with no source).
// ════════════════════════════════════════════════════════════════════════
import { rateOf, gridScale } from './rates.mjs';
import { luckAt } from './sources-hunt.mjs';
import { rolledChance } from './sources-town.mjs';

const Q = Object.freeze({ p10: -Math.log(0.9), p50: Math.log(2), p90: Math.log(10) });
const INF = Infinity;
const BLANK = (why) => ({ hunted: null, rested: null, gold: null, days: INF, p10: INF, p50: INF, p90: INF, blank: why });

/** The distribution of opens until a specific Hearth Chest piece, with warmth (chests.js warmthPm) and the sustainable stoke. -> quantile fn */
export function chestOpens(pPm, share, luck, stokeMult = 1, maxOpens = 4000) {
  const step = luck.warmthStepPm, cap = luck.warmthCapPm;
  const dMax = Math.ceil((cap - 1000) / Math.max(1, step));
  let dist = new Float64Array(dMax + 1); dist[0] = 1;
  let got = 0;
  const cdf = [];
  for (let n = 1; n <= maxOpens; n++) {
    const next = new Float64Array(dMax + 1);
    for (let d = 0; d <= dMax; d++) {
      const m = dist[d]; if (!m) continue;
      const pAny = Math.min(1, (pPm / 1000) * ((1000 + Math.min(d * step, cap - 1000)) / 1000) * stokeMult);
      got += m * pAny * share;
      next[0] += m * pAny * (1 - share);                // another family's weapon: found, cools
      next[Math.min(dMax, d + 1)] += m * (1 - pAny);    // dry: warms
    }
    dist = next; cdf.push(got);
    if (got > 0.995) break;
  }
  const q = (p) => { const i = cdf.findIndex((c) => c >= p); return i < 0 ? INF : i + 1; };
  let mean = 0, prev = 0; cdf.forEach((c, i) => { mean += (i + 1) * (c - prev); prev = c; });
  return { q, mean: mean + (1 - prev) * cdf.length };
}

/** The sustainable stoke (chests.js CHEST_LUCK.stokes): the best average multiplier when a key's own Cinders pay the stokes. */
export function sustainableStoke(luck) {
  return Math.max(1, ...luck.stokes.map((s) => 1 + (s.pm / 1000 - 1) / s.keys));
}

export function makePricer({ D, sources, rates, grid }) {
  const byItem = new Map();
  for (const s of sources) { if (!byItem.has(s.item)) byItem.set(s.item, []); byItem.get(s.item).push(s); }
  const stokeMult = sustainableStoke(D.CHEST_LUCK);
  const chestMemo = new Map();
  const netMemo = new Map();
  const bestMemo = new Map();
  const ctxKey = (c) => [c.level, c.party, c.tier, c.gear, c.townH, c.luckHours || 0, c.skill ?? '', c.stateOk || '', c.market ? 1 : 0, c.scaleKey || ''].join('|');

  /* A GROUND'S RATE for the context: the MEASURED MID cell (ground-rates.json), and for LOW or BiS that cell moved by the progression grid's
     own LOW / BiS against MID at the nearest checkpoint (kills and XP by ratio, net gold by the hero-hour difference: rates.mjs gridScale).
     null when unmeasured. Memoised: the solver asks the same question every day. */
  const rateMemo = new Map();
  const rate = (ground, ctx, level = ctx.level) => {
    const gear = ctx.gear || 'mid';
    const k = ground + '|' + level + '|' + ctx.party + '|' + ctx.tier + '|' + gear;
    if (rateMemo.has(k)) return rateMemo.get(k);
    const r = rateOf(rates, { ground, level, party: ctx.party, tier: ctx.tier });
    let out = r;
    if (r && gear !== 'mid' && grid) {
      const s = gridScale(grid, { level, party: ctx.party, tier: ctx.tier, gear });
      out = { ...r, killsPerH: r.killsPerH * s.kills, xpPerHeroH: r.xpPerHeroH * s.xp, netPerHeroH: r.netPerHeroH + s.netDelta, gearFrom: s.from,
        killsByPerH: Object.fromEntries(Object.entries(r.killsByPerH).map(([m, v]) => [m, v * s.kills])) };
    }
    rateMemo.set(k, out);
    return out;
  };
  /* the grounds a hero of `level` hunts in band */
  const inBand = (level) => Object.keys(D.HUNT_GROUNDS).filter((g) => D.HUNT_INDEX[g] && D.HUNT_INDEX[g].band[0] <= level && level <= D.HUNT_INDEX[g].band[1]);

  function netPerDay(ctx) {
    const k = ctxKey({ ...ctx, skill: '', luckHours: 0 });
    if (netMemo.has(k)) return netMemo.get(k);
    let best = -INF;
    for (const g of inBand(ctx.level)) {
      if (ctx.stateOk === 'OPEN' && !D.OPEN_GROUNDS[g]) continue;
      const r = rate(g, ctx);
      if (r && r.deaths === 0) best = Math.max(best, r.netPerHeroH * ctx.party * 12);
    }
    netMemo.set(k, best);
    return best;
  }
  const goldDays = (gold, ctx) => { if (!(gold > 0)) return 0; const n = netPerDay(ctx); return n > 0 ? gold / n : INF; };
  const restDays = (h, ctx) => (h > 0 ? h / (ctx.party * (ctx.townH || 12)) : 0);

  function finish(r, ctx, extra = {}) {
    /* a hunt's own gold (its supplies over its coin) is its running cost, paid as it goes: it is printed, never turned into days (a ground
       that loses gold is a choice the purse makes, not a wall). Gold a route SPENDS (a price, a fee, a rung) waits on the purse. */
    const days = Math.max(r.hunted / 12, restDays(r.rested, ctx), r.huntGold ? 0 : goldDays(r.gold, ctx), r.limitDays || 0);
    const out = { hunted: r.hunted, rested: r.rested, gold: r.gold, limitDays: r.limitDays || 0, days, blank: null, ...extra };
    if (r.quantiles) Object.assign(out, r.quantiles);
    else if (r.chance) { const m = days; Object.assign(out, { p10: m * Q.p10, p50: m * Q.p50, p90: m * Q.p90 }); }
    else Object.assign(out, { p10: days, p50: days, p90: days });
    return out;
  }

  /* ctx.scale { system: factor }: a what-if that makes every route of that system cost factor x (a drop chance / f, a bench job x f, ...) */
  function route(src, ctx, seen = new Set()) {
    const r = route0(src, ctx, seen);
    const f = ctx.scale && ctx.scale[src.system];
    if (!f || r.blank) return r;
    const m = (x) => (typeof x === 'number' && x > 0 ? x * f : x);
    return { ...r, hunted: m(r.hunted), rested: m(r.rested), gold: m(r.gold), limitDays: m(r.limitDays), days: r.days * f, p10: r.p10 * f, p50: r.p50 * f, p90: r.p90 * f };
  }
  function route0(src, ctx, seen = new Set()) {
    if (src.state === 'PLANNED') return BLANK('planned: no rows to price');
    if (src.sid.startsWith('coded:')) return BLANK('a coded by-product: its chance is not a data row');
    if (ctx.stateOk === 'OPEN' && src.state !== 'OPEN') return BLANK('not open');
    if (src.opens > ctx.level) return BLANK('opens at Level ' + src.opens);
    const luck = 1 + luckAt(ctx.luckHours || 0);
    if (src.hunt) {
      const top = src.band ? src.band[1] : ctx.level;
      const lv = src.hunt.scaled ? top : Math.min(ctx.level, src.band ? Math.max(src.band[1], src.band[0]) : ctx.level);
      const r = rate(src.hunt.ground, ctx, lv);
      if (!r) return BLANK('no rate measured on ' + src.hunt.ground + ' for a party of ' + ctx.party + ' on ' + ctx.tier);
      let perH = 0;
      for (const [m, ch] of Object.entries(src.hunt.perKill)) perH += (r.killsByPerH[m] || 0) * ch * (src.hunt.luck ? luck : 1);
      let goldH = -r.netPerHeroH * ctx.party;
      if (src.hunt.scaled) {
        const pm = D.lootPmFor(src.hunt.ground, ctx.level), price = D.scaledPricePerHour(src.hunt.ground, ctx.level);
        if (!pm || price === null) return BLANK('no scale at Level ' + ctx.level);
        perH *= pm / 1000; goldH += price;
      }
      if (!(perH > 0)) return BLANK('its monster is not killed on ' + src.hunt.ground);
      const h = src.qty / perH;
      return finish({ hunted: h, rested: 0, gold: goldH * h, chance: true, huntGold: true }, ctx, { rate: perH, deaths: r.deaths });
    }
    if (src.fight) {
      const r = rate(src.fight.ground, ctx, ctx.level);
      const wins = r && r.killsByPerH[src.fight.of] > 0 ? src.fight.wins / r.killsByPerH[src.fight.of] : null;
      const p = src.fight.perFight * (src.fight.luck ? luck : 1);
      return finish({ hunted: src.fight.hours / p, rested: 0, gold: 0, chance: p < 1 }, ctx, { prereqHunted: wins });
    }
    if (src.hall) {
      const kr = byItem.get(src.hall.key) || [];
      const key = kr.filter((k) => k.kind === 'drop').map((k) => route(k, ctx, seen)).filter((x) => !x.blank).sort((a, b) => a.hunted - b.hunted)[0];
      if (!key) return BLANK('no priced route to the hall key ' + src.hall.key);
      const n = ctx.party, p = src.hall.slice, first = src.hall.firstShare;   /* a prize roll takes no multiplier (drops.js rollPrize) */
      const missFirst = Math.pow(1 - first, n);
      const dayQ = (q) => { if (1 - missFirst >= q) return 1; const rest = (1 - q) / missFirst; return 1 + Math.ceil(Math.log(rest) / (n * Math.log(1 - p))); };
      const mean = 1 + missFirst * (1 / (1 - Math.pow(1 - p, n)));
      const perDayHunted = key.hunted + src.hall.minutes / 60;
      return finish({ hunted: perDayHunted * mean, rested: 0, gold: 0, limitDays: mean, quantiles: { p10: dayQ(0.1), p50: dayQ(0.5), p90: dayQ(0.9) } }, ctx, { keyHours: key.hunted });
    }
    if (src.chest) {
      const c = src.chest;
      if (c.sure) {
        const weeks = src.qty > 0 ? 1 / (c.opensPerWeek * ctx.party) : INF;
        return finish({ hunted: c.climbHoursAWeek * weeks, rested: 0, gold: 0, limitDays: 7 * weeks / src.qty }, ctx);
      }
      const k = [c.pPm, c.share, c.flat ? 1 : 0].join('|');
      if (!chestMemo.has(k)) chestMemo.set(k, chestOpens(c.flat ? c.pPm / 1000 * 1000 : c.pPm, c.share, c.flat ? { warmthStepPm: 0, warmthCapPm: 1000 } : D.CHEST_LUCK, c.flat ? 1 : stokeMult));
      const dist = chestMemo.get(k);
      const wk = (opens) => (opens / c.opensPerWeek) * 7;
      return finish({ hunted: c.climbHoursAWeek * dist.mean / c.opensPerWeek, rested: 0, gold: 0, limitDays: wk(dist.mean),
        quantiles: { p10: wk(dist.q(0.1)), p50: wk(dist.q(0.5)), p90: wk(dist.q(0.9)) } }, ctx, { opens: dist.mean });
    }
    if (src.task) {
      const r = rate(src.task.ground, ctx, ctx.level);
      const kph = r && r.killsByPerH[src.task.monster];
      if (!(kph > 0)) return BLANK('no rate for ' + src.task.monster + ' on ' + src.task.ground);
      const h = src.task.count / kph / src.qty;
      return finish({ hunted: h, rested: 0, gold: -src.task.gold / src.qty, limitDays: 1 / (src.limit.n * ctx.party * src.qty), huntGold: true }, ctx);
    }
    if (src.node) {
      if (src.node.hoursAFind) return finish({ hunted: 0, rested: src.node.hoursAFind, gold: 0, chance: true }, ctx);
      return finish({ hunted: 0, rested: 1 / src.node.perHour, gold: 0 }, ctx, { skillReq: { [src.node.skill]: src.node.req } });
    }
    if (src.crop) {
      const plots = D.START_PLOTS || 2;
      const perDay = plots * (24 / src.crop.hours) * src.crop.yield;
      return finish({ hunted: 0, rested: 0, gold: src.crop.seedGold / src.crop.yield, limitDays: 1 / perDay }, ctx, { skillReq: { farming: src.crop.req } });
    }
    if (src.job) {
      const j = src.job;
      const lv = Math.max(j.req, ctx.skill ?? j.req);
      const p = j.roll ? rolledChanceAt(src, lv) : 1;
      if (!(p > 0)) return BLANK('the roll cannot land it at level ' + lv);
      let hunted = 0, rested = j.benchSec / 3600, gold = j.fee;
      for (const [id, q] of Object.entries(j.inputs)) {
        const b = best(id, ctx, { exclude: src.sid, seen });
        if (!b.best) return BLANK('input ' + id + ' has no priced route');
        hunted += b.best.hunted * q; rested += b.best.rested * q; gold += b.best.gold * q;
      }
      const per = j.outQty * p;
      return finish({ hunted: hunted / per, rested: rested / per, gold: gold / per, chance: !!j.roll }, ctx, { skillReq: { [j.skill]: j.req } });
    }
    if (src.upgrade || src.step) {
      const u = src.upgrade || src.step;
      let hunted = 0, rested = 0, gold = u.gold || 0;
      for (const [id, q] of Object.entries(u.inputs || {})) {
        if (!(q > 0)) continue;
        const b = best(id, ctx, { exclude: src.sid, seen });
        if (!b.best) return BLANK('input ' + id + ' has no priced route');
        hunted += b.best.hunted * q; rested += b.best.rested * q; gold += b.best.gold * q;
      }
      return finish({ hunted, rested, gold }, ctx, src.step && src.step.req ? { skillReq: { [src.step.skill]: src.step.req } } : {});
    }
    if (src.market) {
      const others = best(src.item, ctx, { exclude: src.sid, noMarket: true, seen });
      const net = netPerDay(ctx);
      const ceiling = others.best && net > 0 ? others.best.days * net + Math.max(0, others.best.gold) : null;
      return finish({ hunted: 0, rested: 0, gold: src.market.floor }, ctx, { floor: src.market.floor, ceiling });
    }
    if (typeof src.gold === 'number') return finish({ hunted: 0, rested: 0, gold: src.gold / (src.qty || 1), limitDays: src.limit ? 1 / (src.limit.n * ctx.party) : 0 }, ctx);
    return BLANK('no cost rule for kind ' + src.kind);
  }
  function rolledChanceAt(src, lv) {
    const x = { roll: src.job.roll, req: src.job.req, outcomes: (byRecipe.get(src.job.recipe) || []).map((s) => s.item) };
    return rolledChance(D, x, src.item, lv);
  }
  const byRecipe = new Map();
  for (const s of sources) if (s.job) { if (!byRecipe.has(s.job.recipe)) byRecipe.set(s.job.recipe, []); byRecipe.get(s.job.recipe).push(s); }

  /** the cheapest route to one unit of `item` (by days), and the runner-up. opts: { exclude (a sid), noMarket, kinds (a set), systems (a set to leave out) } */
  function best(item, ctx, opts = {}) {
    const seen = opts.seen || new Set();
    const memoK = item + '#' + ctxKey(ctx) + '#' + (opts.noMarket ? 1 : 0) + '#' + (opts.without ? [...opts.without].join(',') : '');
    if (!opts.exclude && bestMemo.has(memoK)) return bestMemo.get(memoK);
    if (seen.has(item)) return { best: null, next: null, all: [] };
    const s2 = new Set(seen); s2.add(item);
    const all = [];
    for (const s of byItem.get(item) || []) {
      if (s.sid === opts.exclude || s.useOnly || s.premium || s.byproduct) continue;
      if (s.kind === 'market' && (opts.noMarket || !ctx.market)) continue;
      if (opts.without && opts.without.has(s.system)) continue;
      const r = route(s, ctx, s2);
      if (!r.blank && Number.isFinite(r.days)) all.push({ ...r, sid: s.sid, kind: s.kind, system: s.system });
    }
    all.sort((a, b) => a.days - b.days || (a.gold || 0) - (b.gold || 0));
    const res = { best: all[0] || null, next: all.find((x) => all[0] && x.system !== all[0].system) || all[1] || null, all };
    if (!opts.exclude) bestMemo.set(memoK, res);
    return res;
  }
  return { route, best, netPerDay, rate, inBand, byItem, stokeMult, reset: () => { bestMemo.clear(); netMemo.clear(); } };
}
