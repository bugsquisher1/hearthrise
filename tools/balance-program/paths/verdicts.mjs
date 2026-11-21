// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/paths/verdicts.mjs — BUFF, NERF OR REDO: every system judged by the solver's paths (50-standards 10.4).
//
//   shareTables(runs)                      per band and party: each system's share of the slots it filled; paths that used it
//   judge({ runs, atlas, systems, rules })  one row a system: { system, verdict, ruleTripped, solverEvidence, gridEvidence, change,
//                                          predictedResult, rulingsTouched } (VERDICT_RULES.reportFields, 50-standards 10.4)
//
// A RUN is one gear path (paths/solve.mjs gearPath) of one scenario: its bands, each with `fills` (every target piece, the route that
// filled it, the next route of another system and every system's own best days) and `used` (every source the bill touched).
// The thresholds are standards.mjs VERDICT_RULES (PROPOSED, call 16). Aggregations this file had to choose are named where they are made.
// PURE.
// ════════════════════════════════════════════════════════════════════════

/* the systems exempt from NEGLECTED, by the rule's own kinds (a gold sink, a cosmetic, a social system, a teaching step), plus the ones that
   are a price or a door rather than a route (the market is a price nobody has set; the store is a hunt's fallback; Premium and the start kit) */
export const EXEMPT = Object.freeze({ outfits: 'cosmetic', 'first-hours': 'teaching', premium: 'payment', crowns: 'payment', market: 'a price, not a route',
  'store-supplies': 'a hunt\'s fallback', 'gold-sinks': 'gold sink', tally: 'a side reward', 'rare-moments': 'a long chase, never a kit\'s route' });
/* the rulings each system rests on (rulings-of-record.md, by date): a cut or a nerf of one of these goes back to Tyler */
export const RULINGS = Object.freeze({
  'hearth-chest': '2026-11-14 Tower chests and keys; 2026-11-16 six opens a family a week; 2026-11-18 Tower weapons "pretty major upgrades", never bound',
  catacombs: '2026-11-16 Catacomb keys, the same six as the Tower, a separate count', tower: '2026-11-14; 2026-11-16',
  jewelry: '2026-11-04/05 crafted jewelry and Hallmarks; 2026-11-18 all jewelry is Smithing, Hallmark fees, "choose what matters"',
  tempering: '2026-11-04 paying for power; 2026-11-05 Tempering needs crafting; 2026-11-18 sinks above a band\'s gold on purpose',
  loot: '2026-10-23 loot redesign, a piece an hour a slot; 2026-11-20 generous to Krell, rare after', 'lucky-finds': '2026-11-20 LUCKY FINDS STAY (never cut)',
  'bosses-halls': '2026-11-14 halls; Krell\'s prize', 'boss-calls': '2026-11-14 a called fight pays only his drops on a win; Call out costs stamina only (11-20)',
  smithing: '2026-11-18 all jewelry is Smithing; Klappa\'s Klub is never cut', crafting: '2026-11-18 Crafting makes cloaks and belts', gathering: '2026-11-21 call 13 town hours',
  linings: '2026-11-18 one part + gold a lining, 12 hunted hours, House curing slots', shop: '2026-10-23 a store partner for every supply',
  'scaled-hunts': '2026-11-07 bought by the hour, up to 24', uniques: '2026-11-14 past tier 7 the gear is unique pieces; 2026-11-18 sidegrades to Tower weapons',
  'grounds-staged': '2026-11-18 regions of about 55 Levels', salvage: '2026-11-20 Luck from salvage like GW2', luck: '2026-11-20 Luck v3.1 numbers',
});
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r2 = (x) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/* a piece is CONTESTED when another system (not the market: a price, not a route) also reaches it. Tests (b) and (c) read only contested
   pieces: a system that is a slot's only home (a cloak's bench) is not 'picked by a wide margin', it is the only door (this file's reading
   of 10.4's 'the solver keeps picking it'). Test (a) reads every slot, as written. */
const contested = (f) => !!(f.next && f.next.system !== f.system && f.next.system !== 'market');

export function shareTables(runs) {
  const slots = {}, paths = {};
  for (const run of runs) for (const b of run.bands) {
    const k = b.band + '|' + run.sc.party;
    const t = slots[k] || (slots[k] = { total: 0, by: {} });
    const p = paths[b.band] || (paths[b.band] = { total: 0, by: {} });
    p.total++;
    const seen = new Set();
    for (const f of b.fills) {
      if (!contested(f)) { if (!f.item.startsWith('temper:')) { t.total++; t.by[f.system] = (t.by[f.system] || 0) + 1; } continue; }
      if (f.item.startsWith('temper:')) continue;   // a rung is not a gear slot
      t.total++; t.by[f.system] = (t.by[f.system] || 0) + 1;
      seen.add(f.system);   // (c) counts a path only where the system WON A CHOICE (a piece another system could also give)
    }
    for (const sys of seen) p.by[sys] = (p.by[sys] || 0) + 1;
  }
  return { slots, paths };
}

/**
 * opts: { runs, atlas (sources.mjs atlasOf().atlas), rules (VERDICT_RULES), predict(system, factor) -> { share, margin } | null }
 * Every system a source row names is judged, plus every system the registry lists that no source names (NEGLECTED by construction).
 */
export function judge({ runs, atlas, rules, systemIds, predict, bandOrder, sample }) {
  const { slots, paths } = shareTables(runs);
  const D = rules.dominant.tests, N = rules.neglected;
  const srcSystems = new Map();
  for (const s of Object.values(atlas.sources)) {
    const x = srcSystems.get(s.system) || { open: 0, all: 0, unused: 0, blank: 0 };
    x.all++; if (s.state === 'OPEN') x.open++; if (s.cost === null && s.state === 'OPEN') x.blank++;
    srcSystems.set(s.system, x);
  }
  for (const sid of atlas.lists.sourcesUnused) { const s = atlas.sources[sid]; if (s) srcSystems.get(s.system).unused++; }
  /* the solver judges a system that has a source row; a registry system with none (chat, the settle engine) is the grid's or a dive's to judge */
  const all = new Set([...srcSystems.keys()].filter((x) => x !== 'market'));
  const notJudged = (systemIds || []).filter((id) => !srcSystems.has(id));
  const fills = runs.flatMap((run) => run.bands.flatMap((b) => b.fills.map((f) => ({ ...f, band: b.band, party: run.sc.party, payer: run.sc.payer, townH: run.sc.townH }))));
  const usedSids = new Set(runs.flatMap((run) => run.bands.flatMap((b) => b.used || [])));
  const usedSystems = new Set([...usedSids].map((sid) => atlas.sources[sid] && atlas.sources[sid].system).filter(Boolean));
  const targets = new Set(runs.flatMap((run) => run.bands.flatMap((b) => (b.targets || []).map(([i]) => i))));
  function kitReach(system) {
    const mineSrc = Object.entries(atlas.sources).filter(([, x]) => x.system === system);
    /* a row the solver can price: OPEN, or STAGED with a cost (stretch B is measured with its staged rows opened, 50-standards 1.2) */
    const open = mineSrc.filter(([, x]) => x.state === 'OPEN' || (x.state === 'STAGED' && x.cost));
    const kit = mineSrc.some(([sid, x]) => targets.has(x.item) || usedSids.has(sid));
    return { open: open.length, kit, state: [...new Set(mineSrc.map(([, x]) => x.state))].join('/') || 'none', sample: [...new Set(open.map(([, x]) => x.item))].slice(0, 3).join(', ') };
  }
  const rows = [];
  for (const system of [...all].sort()) {
    const mine = fills.filter((f) => f.system === system);
    const near = fills.filter((f) => f.system !== system && f.bySys && f.bySys[system] !== undefined && f.bySys[system] <= f.days * (1 + N.nearBest));
    const margins = mine.filter((f) => contested(f) && f.next.days > 0 && f.days > 0).map((f) => f.next.days / f.days);
    const ev = { system, verdict: 'HEALTHY', ruleTripped: '-', solverEvidence: '', gridEvidence: '', change: 'none', predictedResult: '-', rulingsTouched: RULINGS[system] || 'none found' };
    /* (a) over half the gear slots at a band, for a party size */
    const a = Object.entries(slots).map(([k, t]) => ({ k, share: (t.by[system] || 0) / Math.max(1, t.total), n: t.by[system] || 0, of: t.total })).filter((x) => x.share > D.a.over).sort((x, y) => y.share - x.share);
    /* (b) the median of next-route / this-route over the pieces it wins (the median is this file's aggregation; the rule reads one goal) */
    const mb = median(margins);
    const worst = mine.filter((f) => contested(f)).sort((x, y) => y.next.days / Math.max(1e-9, y.days) - x.next.days / Math.max(1e-9, x.days))[0];
    /* (c) on over 60% of the band's paths, three bands in a row */
    const order = bandOrder || Object.keys(paths);
    let streak = 0, bestStreak = 0, streakAt = null;
    for (const b of order) { const p = paths[b]; const sh = p ? (p.by[system] || 0) / Math.max(1, p.total) : 0; if (sh > D.c.over) { streak++; if (streak > bestStreak) { bestStreak = streak; streakAt = b; } } else streak = 0; }
    /* (d) it gives a piece whose home is another system for under half that system's own days */
    const d = mine.filter((f) => f.bySys && Object.entries(f.bySys).some(([s2, days]) => s2 !== system && homeOf(atlas, f.item) === s2 && f.days < D.d.under * days));
    /* what the solver can judge: a system whose open rows reach a kit piece (a target of some path, or an input a path's bill used). A system
       whose products are supplies, keys, trophies or training is the supplies and gold goals' to judge (T3, the gold a day): UNMEASURED here */
    const reach = kitReach(system);
    if (EXEMPT[system]) {
      ev.ruleTripped = 'exempt: ' + EXEMPT[system] + ' (judged on its own band)';
    } else if (!reach.open) {
      ev.verdict = 'UNMEASURED'; ev.ruleTripped = 'no priced row (' + reach.state + '): judged on its PROJECTED numbers once it has rows';
      ev.change = 'none until it has rows to price';
    } else if (!reach.kit && !mine.length && !usedSystems.has(system)) {
      ev.verdict = 'UNMEASURED'; ev.ruleTripped = 'its products are not kit pieces (' + reach.sample + '): the supplies goal (T3) and the gold goal judge it';
      ev.change = 'none by the kit paths';
    } else if (a.length || (mb !== null && mb > D.b.over) || bestStreak >= D.c.checkpointsInARow || d.length) {
      ev.verdict = 'DOMINANT';
      const tripped = [];
      if (a.length) tripped.push('a (' + a[0].k + ': ' + a[0].n + ' of ' + a[0].of + ' slots, ' + Math.round(a[0].share * 100) + '%)');
      if (mb !== null && mb > D.b.over) tripped.push('b (median next/this ' + r2(mb) + ' over ' + margins.length + ' pieces)');
      if (bestStreak >= D.c.checkpointsInARow) tripped.push('c (over 60% of paths ' + bestStreak + ' bands in a row, to ' + streakAt + ')');
      if (d.length) tripped.push('d (' + d.length + ' pieces of another system at under half its days, e.g. ' + d[0].item + ')');
      ev.ruleTripped = tripped.join('; ');
      const factor = mb !== null && mb > D.b.over ? mb / D.b.over : 1.25;
      ev.change = 'its routes x' + r2(factor) + ' slower (' + changeWords(system, factor) + ')';
      ev.predictPlan = { system, factor };
    } else if (!mine.length && !near.length && !usedSystems.has(system) && !EXEMPT[system]) {
      ev.verdict = 'NEGLECTED';
      ev.ruleTripped = 'on no best path and no route within ' + Math.round(N.nearBest * 100) + '% of the best (' + fills.length + ' pieces, ' + runs.length + ' paths)';
      const tries = fills.filter((f) => f.bySys && f.bySys[system] !== undefined).map((f) => ({ f, r: f.bySys[system] / Math.max(1e-9, f.days) })).sort((x, y) => x.r - y.r);
      if (tries.length) {
        const factor = (1 + N.buffTo) / tries[0].r;
        ev.change = 'its routes x' + r2(factor) + ' (faster: ' + changeWords(system, factor) + '), to within 15% on ' + tries[0].f.item;
        ev.solverEvidence = 'closest: ' + tries[0].f.item + ' (' + tries[0].f.band + ', party ' + tries[0].f.party + ') its ' + r2(tries[0].f.bySys[system]) + ' d against ' + r2(tries[0].f.days) + ' d by ' + tries[0].f.system;
        ev.predictPlan = { system, factor };
      } else {
        const s = srcSystems.get(system);
        ev.change = s ? 'no kit piece it can make: give it one, or CUT (' + s.open + ' open sources)' : 'no source row names it: CUT or build it';
        ev.solverEvidence = s ? s.open + ' OPEN sources, none reaches a target piece' : 'no source in the atlas';
      }
    }
    /* FAILS ITS PURPOSE (a): every source it has makes a thing nothing uses, or none can be priced */
    const s = srcSystems.get(system);
    if (s && s.open > 0 && (s.unused >= s.open || s.blank >= s.open)) {
      ev.verdict = 'FAILS PURPOSE'; ev.ruleTripped = 'a (' + (s.unused >= s.open ? 'its ' + s.open + ' open sources make nothing used' : 'none of its ' + s.open + ' open sources can be priced') + ')';
      ev.change = 'redo: give it a consumer, or a priced row';
    }
    if (!ev.solverEvidence) ev.solverEvidence = mine.length ? (mine.length + ' pieces won; e.g. ' + (worst ? worst.item + ' ' + worst.band + ' party ' + worst.party + ': ' + r2(worst.days) + ' d, next ' + worst.next.system + ' ' + r2(worst.next.days) + ' d, margin x' + r2(worst.next.days / Math.max(1e-9, worst.days)) : mine[0].item + ' ' + r2(mine[0].days) + ' d, no other route'))
      : near.length ? 'within 25% on ' + near.length + ' pieces (e.g. ' + near[0].item + ')' : usedSystems.has(system) ? 'used inside a chain (an input of a piece another system won)' : 'not on any path';
    /* the grid cells under it: the grounds its winning routes hunt (ground-rates.json, MID), or none when nothing it does is played */
    const grounds = [...new Set(mine.concat(near).map((f) => String((f.system === system ? f.sid : '') || '').split(':')).filter((p) => ['drop', 'scaled', 'hearthfind', 'task'].includes(p[0])).map((p) => p[1]))];
    ev.gridEvidence = grounds.length ? 'ground-rates cells on ' + grounds.slice(0, 4).join(', ') + (grounds.length > 4 ? ' +' + (grounds.length - 4) : '') + ' (MID, parties ' + [...new Set(mine.map((f) => f.party))].join('/') + ', ' + (sample || 'seeds x 1 h') + ')' : 'no grid cell: READ FROM DATA (no engine plays it)';
    ev.share = { pieces: mine.length, near: near.length, medianMargin: r2(mb), slotShareMax: a.length ? r2(a[0].share) : r2(Math.max(0, ...Object.values(slots).map((t) => (t.by[system] || 0) / Math.max(1, t.total)))) };
    rows.push(ev);
  }
  /* PREDICTED: re-run the solver with the change staged (predict is the caller's: a scaled re-solve of the scenario it trips most) */
  if (predict) for (const ev of rows) if (ev.predictPlan) {
    const p = predict(ev.predictPlan.system, ev.verdict === 'DOMINANT' ? ev.predictPlan.factor : 1 / ev.predictPlan.factor);
    ev.predictedResult = p ? 'on ' + p.on + ': pieces won ' + (p.before ?? '?') + ' -> ' + p.pieces + ', median margin ' + (p.marginBefore ?? '-') + ' -> ' + (p.margin ?? '-') : 'not re-run (--report runs it)';
  }
  for (const ev of rows) delete ev.predictPlan;
  const order = { DOMINANT: 0, 'FAILS PURPOSE': 1, NEGLECTED: 2, UNMEASURED: 3, HEALTHY: 4 };
  rows.sort((x, y) => order[x.verdict] - order[y.verdict] || (y.share.pieces - x.share.pieces));
  return { rows, notJudged, shares: { slots, paths } };
}

/* an item's home: the system its own catalogue row points at (the first non-market source in the atlas's order: drops first, then the rest) */
function homeOf(atlas, item) {
  const it = atlas.items[item];
  if (!it) return null;
  const s = it.sources.map((sid) => atlas.sources[sid]).find((x) => x && x.kind !== 'market' && x.state === 'OPEN');
  return s ? s.system : null;
}

function changeWords(system, f) {
  const w = { loot: 'each Scarce row\'s chance', 'grounds-staged': 'the staged rows\' chance', uniques: 'the unique rows\' chance', 'hearth-chest': 'the key\'s weaponPm',
    catacombs: 'the key\'s weaponPm', jewelry: 'the roll odds or the Hallmark gold', smithing: 'the job\'s ms', crafting: 'the job\'s ms', cooking: 'the job\'s ms',
    runecrafting: 'the job\'s ms', gathering: 'the node\'s ms', shop: 'the price', tempering: 'the rung\'s gold', 'bosses-halls': 'the prize slices', 'boss-calls': 'the call row\'s chance' };
  return (w[system] || 'its rows') + ' scaled by ' + r2(f);
}
