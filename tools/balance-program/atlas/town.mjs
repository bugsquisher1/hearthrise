// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/atlas/town.mjs — WHAT A RESTED HOUR MAKES: gathering nodes, bench jobs and crops, read from the data rows.
//
// The town side of the 12 hour day (50-standards 10.2, call 13). READ FROM DATA: no engine plays the town. Every number is the job's paced
// time (src/core/pacing.js, the same dial the server reads) over what it makes, with no tool and no room perk (a tool is up to 35% faster
// on the gathering half; printed as a note, never folded in).
//
//   townModel(D)              { nodes, recipes, crops, bestNodeAt(prod, level), madeBy(id), hoursTo99(skill, opts), skillLevelsTable() }
//   unitCost(T, id, ctx)      { rested, gold, flags, hunted } for one unit of `id` made by the account at skill levels `ctx.skills`,
//                             walking every input back to a node, a crop, the store or a drop (ctx.dropHours(id) prices a drop)
//
// PURE. Imports nothing; the data rows come in through `D` (atlas/data.mjs), so a selftest can plant a recipe.
// ════════════════════════════════════════════════════════════════════════

const meanQty = (n) => (Array.isArray(n.qty) ? (n.qty[0] + n.qty[1]) / 2 : (n.qty || 1));
export const GATHER = Object.freeze({ woodcutting: 'TREES', mining: 'ROCKS', fishing: 'FISH_SPOTS' });
/* The levels 50-standards 10.2 prints every town skill at. */
export const TOWN_LEVELS = Object.freeze([1, 15, 30, 45, 60, 75, 88, 99]);

export function townModel(D) {
  const sec = (ms) => D.pacedActionMs(ms) / 1000;
  const nodes = [];
  for (const [skill, key] of Object.entries(GATHER)) for (const n of D[key]) {
    if (!n.prod) continue;
    const s = sec(n.ms);
    nodes.push({ skill, id: n.id, req: n.req || 1, prod: n.prod, perHour: meanQty(n) * 3600 / s, xpPerHour: D.pacedXp(skill, n.xp) * 3600 / s });
  }
  const recipes = [];
  for (const [skill, list] of Object.entries(D.RECIPES)) for (const r of list) {
    if (r.switch) continue;   // a dark job (a guarantee behind a switch): no player can start it
    const s = sec(r.ms);
    recipes.push({ skill, r, id: r.id, req: r.req || 1, output: r.output || null, outQty: r.outputQty || 1, benchSec: s,
      inputs: D.recipeInputs(r), xpPerHour: D.pacedXp(skill, r.xp) * 3600 / s, roll: r.roll || null, outcomes: r.roll ? D.recipeOutcomes(r) : null });
  }
  const crops = Object.entries(D.CROPS).map(([id, c]) => ({ id, ...c, meanYield: (c.yield[0] + c.yield[1]) / 2 }));
  const cropOf = new Map(crops.map((c) => [c.prod, c]));
  const madeByList = new Map();
  for (const x of recipes) {
    for (const out of x.outcomes || (x.output ? [x.output] : [])) {
      if (!madeByList.has(out)) madeByList.set(out, []);
      madeByList.get(out).push(x);
    }
  }
  /** the best node for `prod` a gatherer at `level` may work (most pieces an hour), or null */
  const bestNodeAt = (prod, level = 99) => nodes.filter((n) => n.prod === prod && n.req <= level).sort((a, b) => b.perHour - a.perHour)[0] || null;
  const anyNode = (prod) => nodes.filter((n) => n.prod === prod).sort((a, b) => a.req - b.req)[0] || null;
  /** hours of one hero to take `skill` from 1 to 99 on its best XP row at each level. opts.chain: bench XP a CHAIN hour (inputs gathered
      by the same hero, rows fed by a drop or a crop left out). Answers { to: { level: hours }, rows } or null for a skill with no row. */
  function hoursTo99(skill, opts = {}) {
    let rows;
    if (GATHER[skill]) rows = nodes.filter((n) => n.skill === skill).map((n) => ({ req: n.req, name: n.id, xph: n.xpPerHour }));
    else {
      rows = recipes.filter((x) => x.skill === skill).map((x) => {
        if (!opts.chain) return { req: x.req, name: x.id, xph: x.xpPerHour };
        const c = jobChain(x, 99);
        if (!c || c.flags.has('D') || c.flags.has('F') || c.flags.has('X')) return null;
        return { req: x.req, name: x.id, xph: x.xpPerHour * (x.benchSec / 3600) / c.rested };
      }).filter(Boolean);
    }
    if (!rows.length) return null;
    let h = 0; const to = {};
    for (let lv = 1; lv < 99; lv++) {
      const best = rows.filter((r) => r.req <= lv).sort((a, b) => b.xph - a.xph)[0];
      if (!best) { h = Infinity; } else h += (D.skillXpForLevel(skill, lv + 1) - D.skillXpForLevel(skill, lv)) / best.xph;
      if (TOWN_LEVELS.includes(lv + 1)) to[lv + 1] = h;
    }
    return { to, rows: rows.length };
  }
  /* the rested hours, flags and store gold of one JOB of recipe x, every input walked back (no drop priced: flag D) */
  function jobChain(x, level, seen = new Set()) {
    let rested = x.benchSec / 3600, gold = 0;
    const flags = new Set();
    for (const [id, q] of Object.entries(x.inputs)) {
      const c = unitWalk(id, level, seen);
      rested += c.rested * q; gold += c.gold * q;
      c.flags.forEach((f) => flags.add(f));
    }
    return { rested, gold, flags };
  }
  /* one unit of `id`: a node at `level` (else the lowest node, flagged L), a crop (F), the cheapest job (recursive), the store (S), or a drop (D) */
  function unitWalk(id, level, seen = new Set()) {
    if (seen.has(id)) return { rested: 0, gold: 0, flags: new Set(['loop']) };
    const s2 = new Set(seen); s2.add(id);
    const n = bestNodeAt(id, level) || anyNode(id);
    if (n) return { rested: 1 / n.perHour, gold: 0, flags: new Set(n.req > level ? ['L'] : []) };
    const crop = cropOf.get(id);
    if (crop) { const seed = D.ITEMS[crop.seed]; return { rested: 0, gold: seed ? (Number(seed.v) || 0) / crop.meanYield : 0, flags: new Set(['F']) }; }
    const jobs = (madeByList.get(id) || []).filter((x) => !x.roll);
    let best = null;
    for (const x of jobs) {
      const c = jobChain(x, level, s2);
      const per = { rested: c.rested / x.outQty, gold: c.gold / x.outQty, flags: c.flags };
      if (!best || per.rested < best.rested) best = per;
    }
    if (best) return best;
    const store = D.storePrice(id);
    if (store > 0) return { rested: 0, gold: store, flags: new Set(['S']) };
    return { rested: 0, gold: 0, flags: new Set(['D']) };
  }
  return { nodes, recipes, crops, cropOf, madeBy: (id) => madeByList.get(id) || [], bestNodeAt, anyNode, hoursTo99, jobChain, unitWalk };
}

/**
 * One unit of `id`, made by the account: { rested, gold, hunted, flags }. ctx: { level (the town skill level for every gathering and bench
 * step), dropHours(id) -> hunted hours a drop takes or null }. A drop input is priced in hunted hours (its best route); a crop in its seed;
 * a store input in gold. flags: D an unpriced drop, F a crop, S bought at the store, L a node above the level, X no source at all.
 */
export function unitCost(T, id, ctx, seen = new Set()) {
  if (seen.has(id)) return { rested: 0, gold: 0, hunted: 0, flags: new Set(['loop']) };
  const s2 = new Set(seen); s2.add(id);
  const level = ctx.level ?? 99;
  const n = T.bestNodeAt(id, level) || T.anyNode(id);
  if (n) return { rested: 1 / n.perHour, gold: 0, hunted: 0, flags: new Set(n.req > level ? ['L'] : []) };
  const crop = T.cropOf.get(id);
  if (crop) return { rested: 0, gold: (ctx.seedPrice ? ctx.seedPrice(crop.seed) : 0) / crop.meanYield, hunted: 0, flags: new Set(['F']) };
  const jobs = T.madeBy(id).filter((x) => !x.roll);
  let best = null;
  for (const x of jobs) {
    let rested = x.benchSec / 3600, gold = ctx.fee ? ctx.fee(x) : 0, hunted = 0;
    const flags = new Set();
    for (const [inp, q] of Object.entries(x.inputs)) {
      const c = unitCost(T, inp, ctx, s2);
      rested += c.rested * q; gold += c.gold * q; hunted += c.hunted * q;
      c.flags.forEach((f) => flags.add(f));
    }
    const per = { rested: rested / x.outQty, gold: gold / x.outQty, hunted: hunted / x.outQty, flags, recipe: x.id, req: x.req, skill: x.skill };
    const days = (p) => p.rested / 12 + p.hunted / 12;
    if (!flags.has('X') && (!best || days(per) < days(best))) best = per;
  }
  if (best) return best;
  const store = ctx.storePrice ? ctx.storePrice(id) : 0;
  if (store > 0) return { rested: 0, gold: store, hunted: 0, flags: new Set(['S']) };
  const dh = ctx.dropHours ? ctx.dropHours(id) : null;
  if (dh !== null && dh !== undefined && Number.isFinite(dh)) return { rested: 0, gold: 0, hunted: dh, flags: new Set(['D']) };
  return { rested: 0, gold: 0, hunted: 0, flags: new Set(['X']) };
}
