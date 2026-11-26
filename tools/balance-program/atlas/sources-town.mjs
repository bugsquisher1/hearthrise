// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/atlas/sources-town.mjs — EVERY WAY A RESTED HOUR OR A GOLD PIECE TURNS INTO AN ITEM, read from the rows.
//
//   townSources(D, T) -> [row...]   T is atlas/town.mjs townModel(D). The row shape is sources-hunt.mjs's, with:
//     job      { skill, req, benchSec, outQty, inputs { id: qty }, fee (gold a job), p (a rolled outcome's chance a job) }   a bench job
//     node     { skill, req, perHour }                                                                                  a gathering node
//     crop     { req, hours (wall clock), yield, seed, seedGold }                                                        a farm plot
//     gold     gold a unit                                                                                               the Shop, the store
//     upgrade  { track, tier, rung, gold, inputs }   a Tempering rung (an `item` of the form temper:<track>:<tier>:<rung>)
//     step     { from, gold, inputs, skill, req, perDay }   a Hallmark or a reforge: a graded piece into the next
//   The market is one row a tradeable item: its floor is the Shop's bid, its ceiling the maker's own time (atlas/cost.mjs prices it).
//   Linings are PLANNED (src/data/imbuements.js: "IMBUING IS NOT BUILT"): one row a lining kind and tier, no price, so A3 lists them.
// PURE.
// ════════════════════════════════════════════════════════════════════════

const SKILL_SYSTEM = Object.freeze({ cooking: 'cooking', smithing: 'smithing', crafting: 'crafting', runecrafting: 'runecrafting', inner_flame: 'inner-flame' });
const TRADE_TYPES = new Set(['weapon', 'armor', 'offhand', 'jewelry', 'ammo', undefined, 'tool', 'outfit_bundle']);

export function townSources(D, T) {
  const out = [];
  /* BENCH JOBS. A rolled job (jewelry) is a source of every outcome at its chance a job; a plain job of its output. */
  for (const x of T.recipes) {
    const fee = (() => {
      if (!D.benchTaxed(x.r) || !D.BENCH_TAX[x.skill]) return 0;
      const mg = D.BENCH_TAX[x.skill] * D.vendorPriceOf(x.output) * x.outQty;
      return mg < D.BENCH_TAX_FREE_UNDER_MG ? 0 : mg / 1000;
    })();
    const sys = x.roll ? 'jewelry' : SKILL_SYSTEM[x.skill] || x.skill;
    const outs = x.outcomes || (x.output ? [x.output] : []);
    for (const item of outs) {
      const p = x.roll ? rolledChance(D, x, item) : 1;
      if (!(p > 0)) continue;
      out.push({ sid: 'recipe:' + x.id + ':' + item, kind: 'recipe', system: sys, item, qty: x.roll ? 1 : x.outQty, state: 'OPEN', opens: 1,
        where: x.skill + ' ' + x.req + ': ' + x.r.name, chance: x.roll ? true : false, label: 'READ FROM DATA (paced bench time, no room perk)',
        job: { recipe: x.id, skill: x.skill, req: x.req, benchSec: x.benchSec, outQty: x.roll ? 1 : x.outQty, inputs: x.inputs, fee, p, roll: x.roll || null } });
    }
  }
  /* GATHERING NODES (no tool) */
  for (const n of T.nodes) {
    out.push({ sid: 'gather:' + n.id + ':' + n.prod, kind: 'gather', system: 'gathering', item: n.prod, qty: 1, state: 'OPEN', opens: 1, where: n.skill + ' ' + n.req + ': ' + n.id,
      chance: false, label: 'READ FROM DATA (paced, no tool: a tool is up to 35% faster)', node: { skill: n.skill, req: n.req, perHour: n.perHour } });
  }
  /* FARM PLOTS (wall clock; a plant and a harvest are presses, not rested hours) */
  for (const c of T.crops) {
    const seed = D.ITEMS[c.seed];
    out.push({ sid: 'farm:' + c.id + ':' + c.prod, kind: 'farm', system: 'farming', item: c.prod, qty: 1, state: 'OPEN', opens: 1, where: 'farming ' + c.req + ': ' + c.name,
      chance: false, label: 'READ FROM DATA', crop: { req: c.req, hours: c.hours, yield: c.meanYield, seed: c.seed, seedGold: D.shopGold.get(c.seed) || (seed ? Number(seed.v) || 0 : 0) } });
  }
  /* THE SHOP: the listed rows only (catalogue-coherence: only a listed row is a door) */
  for (const [item, gold] of D.shopGold) {
    out.push({ sid: 'shop:' + item, kind: 'shop', system: 'shop', item, qty: 1, state: 'OPEN', opens: 1, where: 'the Shop', chance: false, label: 'READ FROM DATA', gold });
  }
  /* THE STORE: a hunt buys a basic in its partner's place at 75% of its effect (supply-basics.js); priced as the partner's equal */
  for (const b of D.BASIC_SUPPLIES) {
    if (!b.partner || !D.ITEMS[b.partner]) continue;
    out.push({ sid: 'store:' + b.id + ':' + b.partner, kind: 'shop', system: 'store-supplies', item: b.partner, qty: 1, state: 'OPEN', opens: 1,
      where: 'the store (' + b.id + ', bought in the hunt)', chance: false, label: 'READ FROM DATA; a use, never a bag item', gold: D.storePrice(b.partner), useOnly: true });
  }
  /* THE ARMS MASTER's training items (the gold rows), the START KIT, PREMIUM's daily claim */
  for (const g of D.TRAINING_GEAR_ITEMS) if (!g.bound) out.push({ sid: 'arms:' + g.id, kind: 'shop', system: 'training', item: g.id, qty: 1, state: 'OPEN', opens: D.TRAINING_RULES.minLevel || 1,
    where: 'the Arms Master', chance: false, label: 'READ FROM DATA', gold: g.gold });
  for (const [item, qty] of Object.entries(D.START_INVENTORY)) out.push({ sid: 'start:' + item, kind: 'shop', system: 'first-hours', item, qty, state: 'OPEN', opens: 1, where: 'the start kit', chance: false, label: 'READ FROM DATA', gold: 0, once: true });
  for (const item of Object.values(D.START_EQUIPMENT)) if (item) out.push({ sid: 'start:eq:' + item, kind: 'shop', system: 'first-hours', item, qty: 1, state: 'OPEN', opens: 1, where: 'the start kit', chance: false, label: 'READ FROM DATA', gold: 0, once: true });
  if (D.PREMIUM_LOGIN_REWARD && D.PREMIUM_LOGIN_REWARD.item) out.push({ sid: 'premium:login:' + D.PREMIUM_LOGIN_REWARD.item, kind: 'shop', system: 'premium', item: D.PREMIUM_LOGIN_REWARD.item,
    qty: D.PREMIUM_LOGIN_REWARD.qty || 1, state: 'OPEN', opens: 1, where: 'the Premium daily claim', chance: false, label: 'READ FROM DATA', gold: 0, limit: { per: 'day', n: 1, scope: 'hero' }, premium: true });
  /* THE CROWNS STORE's bound training items (catalogue-coherence PENDING_SOURCE: it waits on the Crowns ledger): PLANNED */
  for (const g of D.TRAINING_GEAR_ITEMS) if (g.bound) out.push({ sid: 'crowns:' + g.id, kind: 'shop', system: 'crowns', item: g.id, qty: 1, state: 'PLANNED', opens: 1,
    where: 'the Crowns store (not built)', chance: false, label: 'PLANNED: the Crowns ledger is not built', premium: true });
  /* A SOURCE AN ENGINE CODES (catalogue-coherence CODED_SOURCES, e.g. a burnt cook): a by-product whose chance is not a data row */
  for (const [id, c] of Object.entries(D.CODED_SOURCES || {})) out.push({ sid: 'coded:' + id, kind: 'recipe', system: 'cooking', item: id, qty: 1, state: 'OPEN', opens: 1, byproduct: true,
    where: c.label + ' (' + c.file + ')', chance: true, label: 'CODED in ' + c.file + ': its chance is not a data row' });
  /* TEMPER ON STEPS (src/data/temper.js TEMPER_STEPS; the old rungs retired with lane/tp-im-steps): dark behind temper_steps, so PLANNED rows,
     one a rank, opening at its Level; its price is hours of wage at the worn piece (src/core/temper-steps.js), never an offer row */
  for (let rank = 1; rank <= D.TEMPER_STEPS.ranks; rank++) out.push({ sid: 'temper:rank:' + rank, kind: 'temper', system: 'tempering', item: 'temper:rank:' + rank, qty: 1, state: 'PLANNED',
    opens: rank * D.TEMPER_STEPS.rankEvery, where: 'the smith (dark: temper_steps)', chance: false, label: 'PLANNED: Temper on steps is staged and dark' });
  /* THE HALLMARK and THE REFORGE (src/data/jewelry.js): a graded piece and a gem (and bars) and gold into the next row, at the jeweler */
  for (const o of D.HALLMARK_OFFERS) out.push({ sid: 'hallmark:' + o.from + ':' + o.to, kind: 'hallmark', system: 'jewelry', item: o.to, qty: 1, state: 'OPEN', opens: o.level || 1, where: 'the jeweler (Hallmark)',
    chance: false, label: 'READ FROM DATA', step: { from: o.from, gold: o.gold, inputs: { [o.from]: 1, [o.gem]: 1 }, skill: o.skill, req: o.level, perDay: 10 } });
  for (const o of D.REFORGE_OFFERS) out.push({ sid: 'reforge:' + o.from + ':' + o.to, kind: 'hallmark', system: 'jewelry', item: o.to, qty: 1, state: 'OPEN', opens: o.level || 1, where: 'the jeweler (reforge)',
    chance: false, label: 'READ FROM DATA', step: { from: o.from, gold: o.gold, inputs: { [o.from]: 1, [o.gem]: 1, [o.metal]: o.bars || 0 }, skill: o.skill, req: o.level } });
  /* (the old linings' PLANNED rows read each part's retired imbue kind and tier: imbuements are src/data/imbue-rules.js's rows now, dark) */
  /* THE MARKET: every tradeable item (a floor and a ceiling, never a real price: three sales ever) */
  for (const [id, it] of Object.entries(D.ITEMS)) {
    if (!it || it.bop || !TRADE_TYPES.has(it.type) || it.type === 'key' || !(Number(it.v) > 0)) continue;
    out.push({ sid: 'market:' + id, kind: 'market', system: 'market', item: id, qty: 1, state: 'OPEN', opens: 1, where: 'the Weighhouse', chance: false,
      label: 'a floor (the Shop\'s bid) and a ceiling (the maker\'s own time): no market price exists', market: { floor: D.vendorPriceOf(id) } });
  }
  return out;
}

/* the chance one job of rolled recipe x makes exactly `item`: its grade's odds at the job's own level row, split evenly over that grade's outcomes */
export function rolledChance(D, x, item, level = x.req) {
  const it = D.ITEMS[item] || D.JEWELRY_ITEMS[item] || {};
  const odds = D.rollOdds(x.roll, level);
  const grade = it.jewelGrade || 'plain';
  const same = (x.outcomes || []).filter((o) => ((D.ITEMS[o] || D.JEWELRY_ITEMS[o] || {}).jewelGrade || 'plain') === grade).length || 1;
  return (odds[grade] || 0) / D.ODDS_SCALE / same;
}

/* the Level a gear tier is worn at (gear-tiers.js MATERIAL_TIERS) */
export function tierLevel(D, tier) {
  const row = D.MATERIAL_TIERS.find((m) => m.tier === tier);
  return row ? row.level : 1;
}
