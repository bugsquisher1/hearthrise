#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/paths.mjs — THE BEST-PATH SOLVER: the fastest route through the whole game for a 12 hour player, using every
// source together, for a lone hero and parties of 2, 3 and 4, free, Premium and bought gold, at 12 and at 4 rested hours a day
// (50-standards 10.3 to 10.5; Tyler 2026-11-21: "best possible paths forward in the game, how quickly people can get full BiS hunting
// 12 hrs a day ... buffing things that suck, nerfing things too strong, or redoing entire systems").
//
//   node tools/balance-program/paths.mjs              the full run (the nightly's): every scenario on the worker threads, 200 seeded
//                                                     runs a band for the percentiles; writes tools/balance-program/paths.json
//   node tools/balance-program/paths.mjs --quick      the release cut: a lone hero and a four, free and bought gold, 12 rested hours
//   node tools/balance-program/paths.mjs --report     also judge every system by standards.mjs VERDICT_RULES and re-solve each flagged
//                                                     one with its change staged (the predicted result); prints the eight-field rows
//   node tools/balance-program/paths.mjs --workers N  worker threads (default 4, at most 4: other lanes share the PC)
//   node tools/balance-program/paths.mjs --selftest   HERMETIC: plants a recipe ten times better than a kit piece's best route and one ten
//                                                     times worse; the report must read the first DOMINANT and the second NEGLECTED, and
//                                                     an item with no source must be on the atlas's no-source list
//
// What it reads: the atlas (sources.mjs, built in memory from the same rows atlas.json holds), the ground rates (ground-rates.json, and
// grid.json once the grid lane lands), LEVEL_CURVE, the kits (atlas/kits.mjs), the price rows. What it cannot know: market prices and
// other players: the market is the maker's own time (its ceiling) for a free buyer and free for bought gold, and it says so.
// NOT YET DONE (50-standards 10.5's first check): the blind play to Level 30 that B3 is calibrated on; the hour-by-hour first two days
// are by the hour, the rest by the day. Every number is COMPUTED on MEASURED rates; none is played by a person.
// Exit 0 when it ran (bands start in report), 1 on a selftest miss, 2 on a bad argument.
//
// mutant-anchors: none — --selftest plants its recipes and its item into the loaded data bundle in memory; no tracked file is patched
// ci-step: economy-selftests | Best-path solver - a planted dominant recipe reads DOMINANT, a planted slow one NEGLECTED
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/paths.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isMain } from '../../tests/_is-main.mjs';
import { setup, playScenario } from './paths/run.mjs';
import { GEAR_BANDS } from './paths/solve.mjs';
import { judge } from './paths/verdicts.mjs';
import { VERDICT_RULES, PARTIES, CHECKPOINTS } from './standards.mjs';
import { SYSTEMS } from './systems.mjs';
import { styleOf } from './atlas/rates.mjs';
import { loadData, ROOT } from './atlas/data.mjs';
import { GATHER } from './atlas/town.mjs';
import { recommendedHunt } from '../../src/shell/hunt-list.js';

export const PATHS_FILE = join(ROOT, 'tools', 'balance-program', 'paths.json');
const RUN_FILE = fileURLToPath(new URL('./paths/run.mjs', import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const r2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const BENCH_SYSTEMS = Object.freeze(['smithing', 'crafting', 'cooking', 'runecrafting', 'inner-flame', 'jewelry']);
const compOf = (size, i = 0) => PARTIES.find((p) => p.size === size).seats[i].map(styleOf);

export function scenarios(quick) {
  const out = [];
  const sizes = quick ? [1, 4] : [1, 2, 3, 4];
  for (const party of sizes) out.push({ id: 'level-' + party, goal: 'level', party, comp: compOf(party), payer: 'free', townH: 12 });
  /* the pace seat (50-standards P1, until call 1): the lone MID hero on Normal; a band's length is read on it */
  out.push({ id: 'pace-1', goal: 'level', party: 1, comp: compOf(1), payer: 'free', townH: 12, tiers: ['normal'] });
  if (!quick) out.push({ id: 'level-2b', goal: 'level', party: 2, comp: compOf(2, 1), payer: 'free', townH: 12 });
  for (const party of sizes) out.push({ id: 'bis-' + party + '-free-12', goal: 'bis', party, comp: compOf(party), payer: 'free', townH: 12, sample: quick ? 50 : 200 });
  for (const party of quick ? [1, 4] : [1, 4]) out.push({ id: 'bis-' + party + '-bought-12', goal: 'bis', party, comp: compOf(party), payer: 'bought', townH: 12 });
  if (!quick) {
    for (const party of sizes) out.push({ id: 'bis-' + party + '-free-4', goal: 'bis', party, comp: compOf(party), payer: 'free', townH: 4 });
    for (const party of [1, 4]) out.push({ id: 'bis-' + party + '-premium-12', goal: 'bis', party, comp: compOf(party), payer: 'premium', townH: 12 });
    out.push({ id: 'bis-1-nobench-12', goal: 'bis', party: 1, comp: compOf(1), payer: 'free', townH: 12, without: BENCH_SYSTEMS, market: true });
    for (const party of sizes) out.push({ id: 'mid-' + party + '-free-12', goal: 'mid', party, comp: compOf(party), payer: 'free', townH: 12 });
  } else out.push({ id: 'mid-1-free-12', goal: 'mid', party: 1, comp: compOf(1), payer: 'free', townH: 12 });
  return out;
}

/** Play `list` on `workers` threads (each loads the atlas once). */
async function playAll(list, opts, workers) {
  const n = Math.max(1, Math.min(4, workers, list.length));
  if (n === 1) { const ctx = await setup(opts); return list.map((sc) => playScenario(ctx, sc)); }
  /* the longest first, dealt round-robin */
  const weight = (sc) => (sc.goal === 'level' ? 0.2 : 1) * sc.party;
  const sorted = list.slice().sort((a, b) => weight(b) - weight(a));
  const chunks = Array.from({ length: n }, () => []);
  sorted.forEach((sc, i) => chunks[i % n].push(sc));
  const results = [];
  await Promise.all(chunks.map((chunk) => new Promise((res, rej) => {
    const w = new Worker(RUN_FILE, { workerData: { kind: 'paths', opts, scenarios: chunk } });
    w.on('message', (m) => { if (m.type === 'done') results.push(m.result); if (m.type === 'end') { w.terminate(); res(); } });
    w.on('error', rej);
  })));
  return results;
}

/** The bands of 50-standards 10.2 and 10.3 this file reads, from the runs and the atlas. */
export function pathBands(runs, ctx) {
  const by = (id) => runs.find((r) => r.sc.id === id);
  const lone = by('level-1').level, pace = (by('pace-1') || by('level-1')).level, out = {};
  const bandLen = (b) => (pace.at[b.to] !== undefined && (b.from === 1 || pace.at[b.from] !== undefined) ? pace.at[b.to] - (b.from === 1 ? 0 : pace.at[b.from]) : null);
  const bis1 = by('bis-1-free-12');
  out.B1 = bis1 ? bis1.bands.filter((b) => !b.pastKrell).map((b) => ({ band: b.band, days: b.days, bandDays: r2(bandLen(b)), ratio: b.days !== null && bandLen(b) ? r2(b.days / bandLen(b)) : null })) : null;
  out.B2 = bis1 ? bis1.bands.filter((b) => b.pastKrell).map((b) => ({ band: b.band, days: b.days, regionDays: r2(bandLen(b)), ratio: b.days !== null && bandLen(b) ? r2(b.days / bandLen(b)) : null })) : null;
  /* B3: the Hunts window's advice against the solver's fastest Level (the screen's path; no blind play yet) */
  out.B3 = runs.filter((r) => r.screen).map((r) => {
    const cps = CHECKPOINTS.filter((c) => r.level.at[c] !== undefined && r.screen.at[c] !== undefined && c >= 5);
    const worst = cps.map((c) => ({ c, ratio: r2(r.screen.at[c] / Math.max(1e-9, r.level.at[c])) })).sort((a, b) => b.ratio - a.ratio)[0];
    return { party: r.sc.party, worst, screenStopsAt: r.screen.topLevel };
  });
  /* B4: open grounds on no path; B5: Levels a ground stays on the fastest Level path past its band's top */
  const onPath = new Set();
  for (const r of runs) { if (r.level) r.level.grounds.forEach((g) => onPath.add(g.ground)); if (r.bands) r.bands.forEach((b) => b.grounds.forEach(([, g]) => onPath.add(String(g).split(':')[0]))); }
  out.B4 = Object.keys(ctx.D.OPEN_GROUNDS).filter((g) => !onPath.has(g));
  out.B5 = runs.filter((r) => r.level).flatMap((r) => r.level.grounds.map((g) => ({ party: r.sc.party, ground: g.ground, tier: g.tier, from: g.fromLevel, to: g.toLevel,
    past: g.toLevel - ((ctx.D.HUNT_INDEX[g.ground] || { band: [0, 0] }).band[1]) })).filter((x) => x.past > 0)).sort((a, b) => b.past - a.past).slice(0, 12);
  const sumDays = (r) => (r && r.bands ? r.bands.reduce((s, b) => s + (b.days ?? 400), 0) : null);
  const huntedOf = (r) => (r && r.bands ? r.bands.reduce((s, b) => s + (b.hunted || 0), 0) : null);
  out.B6 = [1, 4].map((p) => ({ party: p, free: huntedOf(by('bis-' + p + '-free-12')), premium: huntedOf(by('bis-' + p + '-premium-12')),
    ratio: by('bis-' + p + '-premium-12') ? r2(huntedOf(by('bis-' + p + '-premium-12')) / Math.max(1e-9, huntedOf(by('bis-' + p + '-free-12')))) : null }));
  out.B7 = [1, 4].map((p) => ({ party: p, earned: sumDays(by('bis-' + p + '-free-12')), bought: sumDays(by('bis-' + p + '-bought-12')),
    ratio: by('bis-' + p + '-bought-12') ? r2(sumDays(by('bis-' + p + '-free-12')) / Math.max(1e-9, sumDays(by('bis-' + p + '-bought-12')))) : null, market: 'bought gold buys every tradeable piece at once (no supply limit: the market cannot be known)' }));
  out.B8 = runs.filter((r) => r.bands && r.sc.sample).flatMap((r) => r.bands.filter((b) => b.sampled).map((b) => ({ party: r.sc.party, band: b.band, p50: b.sampled.p50, p90: b.sampled.p90, ratio: b.sampled.p50 > 0 ? r2(b.sampled.p90 / b.sampled.p50) : null })));
  out.B9 = [2, 3, 4].map((p) => { const r = by('level-' + p); if (!r) return null; const cps = CHECKPOINTS.filter((c) => c >= 10 && r.level.at[c] !== undefined && lone.at[c] !== undefined);
    const worst = cps.map((c) => ({ c, ratio: r2(r.level.at[c] / Math.max(1e-9, lone.at[c])) })).sort((a, b) => b.ratio - a.ratio)[0]; return { party: p, worstLevelRatio: worst }; }).filter(Boolean);
  /* T5: no bench, buying what benches make at the maker's own time, over the best path */
  const nb = by('bis-1-nobench-12');
  out.T5 = nb ? { noBench: sumDays(nb), best: sumDays(bis1), ratio: r2(sumDays(nb) / Math.max(1e-9, sumDays(bis1))), unfinished: nb.bands.filter((b) => b.days === null).map((b) => b.band) } : null;
  /* T7: rested hours a hero a day the best path used (the most of any band) */
  out.T7 = runs.filter((r) => r.bands && r.sc.townH === 12 && r.sc.payer === 'free').map((r) => ({ party: r.sc.party, goal: r.sc.goal, maxRestPerDay: Math.max(0, ...r.bands.map((b) => b.restPerDay)) }));
  /* T4: the BiS pieces past MID that pass through a bench (by count: the power share is the grid's, not measured here) */
  if (bis1) {
    const midRun = by('mid-1-free-12');
    const t4 = bis1.bands.map((b) => {
      const mid = midRun && midRun.bands.find((x) => x.band === b.band);
      const midSet = new Set(mid ? mid.targets.map(([i]) => i) : []);
      const delta = b.fills.filter((f) => !midSet.has(f.item));
      const bench = delta.filter((f) => BENCH_SYSTEMS.includes(f.system) || f.system === 'tempering');
      return { band: b.band, delta: delta.length, throughBench: bench.length, share: delta.length ? r2(bench.length / delta.length) : null };
    });
    out.T4 = t4;
  }
  /* A7: a town skill's 15-level stretches with no product on any path */
  const used = new Set(runs.flatMap((r) => (r.bands || []).flatMap((b) => b.used || [])));
  const a7 = [];
  for (const skill of [...Object.keys(GATHER), ...Object.keys(ctx.D.RECIPES)]) {
    const reqs = [...used].map((sid) => ctx.atlas.sources[sid]).filter((s) => s && ((s.kind === 'recipe' && s.where.startsWith(skill + ' ')) || (s.kind === 'gather' && s.where.startsWith(skill + ' '))))
      .map((s) => Number(s.where.split(' ')[1].replace(':', '')));
    for (let lo = 1; lo <= 99; lo += 15) { const hi = Math.min(99, lo + 14); if (!reqs.some((q) => q >= lo && q <= hi)) a7.push(skill + ' ' + lo + '-' + hi); }
  }
  out.A7 = a7;
  return out;
}

/** T2 and T6: what a rested hour makes in gold against a hunted hour (lone MID, Normal, the best ground in band), at checkpoints. */
export function townGold(ctx) {
  const { T, D, P } = ctx;
  const out = [];
  for (const L of [10, 30, 45, 60, 88, 110, 145, 185]) {
    const lv = Math.min(99, L);
    let best = { gold: 0, row: null };
    for (const n of T.nodes) if (n.req <= lv) { const g = n.perHour * D.vendorPriceOf(n.prod); if (g > best.gold) best = { gold: g, row: n.id }; }
    for (const x of T.recipes) {
      if (x.req > lv || x.roll || !x.output) continue;
      const c = T.jobChain(x, lv);
      /* a crop's yield is bounded by the plots, a drop's by the hunt: a rested hour's own gold leaves both out */
      if (!c || c.flags.has('D') || c.flags.has('F') || c.flags.has('X') || c.flags.has('L') || !(c.rested > 0)) continue;
      const g = (D.vendorPriceOf(x.output) * x.outQty - c.gold) / c.rested;
      if (g > best.gold) best = { gold: g, row: x.id };
    }
    const hunt = P.netPerDay({ level: L, party: 1, tier: 'normal', gear: 'mid', townH: 12 }) / 12;
    out.push({ level: L, restedGoldPerH: Math.round(best.gold), row: best.row, huntedNetPerH: Math.round(hunt), T2: hunt > 0 ? r2(best.gold / hunt) : null,
      T6crafter24h: hunt > 0 ? r2((best.gold * 24) / (hunt * 12 + best.gold * 12)) : null });
  }
  return out;
}

function regionDays(runs) {
  const out = {};
  for (const r of runs.filter((x) => x.bands && x.sc.goal === 'bis')) {
    const k = r.sc.id;
    out[k] = {};
    for (const b of r.bands) { const reg = b.region; out[k][reg] = out[k][reg] || []; out[k][reg].push(b.band + ' ' + (b.days === null ? 'not done in ' + 400 + ' d (' + b.missing.slice(0, 3).join(', ') + ')' : b.days + ' d')); }
  }
  return out;
}

async function main() {
  if (has('selftest')) return selftest();
  const t0 = Date.now();
  const quick = has('quick');
  const opts = { quick, beam: quick ? 2 : 4 };
  const list = scenarios(quick);
  const runs = await playAll(list, opts, Number(arg('workers', 4)));
  const ctx = await setup({ quick, beam: 1 });
  for (const p of quick ? [1, 4] : [1, 2, 3, 4]) {
    const r = runs.find((x) => x.sc.id === 'level-' + p);
    if (r) r.screen = ctx.S.screenPath(r.sc, (levels, n) => recommendedHunt(levels, n));
  }
  const bands = pathBands(runs, ctx);
  const tg = townGold(ctx);
  let verdict = null;
  if (has('report') || !quick) {
    const predictSc = runs.find((r) => r.sc.id === 'bis-4-free-12') || runs.find((r) => r.sc.id === 'bis-1-free-12');
    const predict = has('report') ? (system, factor) => {
      const sc = { ...predictSc.sc, scale: { [system]: factor }, sample: 0, without: undefined };
      const rr = playScenario(ctx, sc);
      const v = judge({ runs: [rr], atlas: ctx.atlas, rules: VERDICT_RULES, systemIds: [] }).rows.find((x) => x.system === system);
      return { pieces: v ? v.share.pieces : 0, margin: v ? v.share.medianMargin : null, on: sc.id };
    } : null;
    verdict = judge({ runs: runs.filter((r) => r.bands), atlas: ctx.atlas, rules: VERDICT_RULES, systemIds: SYSTEMS.map((s) => s.id), predict, bandOrder: GEAR_BANDS.map((b) => b.id) });
  }
  const ms = Date.now() - t0;
  let commit = 'unknown'; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* not a repo */ }
  const doc = { schema: 'hearthrise.balance-program.paths/1', commit, quick, ms, rates: ctx.atlas ? 'ground-rates.json' : null, label: 'COMPUTED on MEASURED ground rates (MID kit); LOW and BiS rates wait on grid.json',
    runs: runs.map((r) => ({ ...r, bands: r.bands ? r.bands.map(({ rates, ...b }) => b) : undefined })), bands, townGold: tg, regions: regionDays(runs), verdicts: verdict ? verdict.rows : null, shares: verdict ? verdict.shares : null };
  if (!quick) writeFileSync(PATHS_FILE, JSON.stringify(doc) + '\n');
  printReport(doc, has('report'));
  console.log('runtime ' + Math.round(ms / 1000) + ' s (' + list.length + ' scenarios' + (quick ? ', quick' : ', full') + ')' + (quick ? '' : ' -> ' + PATHS_FILE));
}

function printReport(doc, full) {
  const B = doc.bands;
  console.log('PATHS on ' + doc.commit + ' (' + doc.label + ')');
  const lvl = doc.runs.filter((r) => r.level);
  console.log('fastest Level, days at 12 h (party: L10 L30 L45 L60 L88 L110 L145 L185): ' + lvl.map((r) => r.sc.id + ' ' + [10, 30, 45, 60, 88, 110, 145, 185].map((L) => r.level.at[L] ?? '-').join('/')).join(' | '));
  for (const [id, regs] of Object.entries(doc.regions)) console.log('days to full BiS, ' + id + ': ' + Object.entries(regs).map(([reg, l]) => reg + ' [' + l.join('; ') + ']').join(' '));
  for (const id of ['bis-1-free-12', 'bis-4-free-12']) {
    const r = doc.runs.find((x) => x.sc.id === id); if (!r) continue;
    console.log('the slowest pieces (the day each was owned), ' + id + ': ' + r.bands.map((b) => b.band + ' ' + b.fills.slice().sort((x, y) => (y.day ?? 1e9) - (x.day ?? 1e9)).slice(0, 3).map((f) => f.item + '<' + f.system + '@' + (f.day ?? 'never')).join(', ')).join(' | '));
  }
  console.log('B1 ' + JSON.stringify(B.B1));
  console.log('B2 ' + JSON.stringify(B.B2));
  console.log('B3 ' + JSON.stringify(B.B3));
  console.log('B4 open grounds on no path: ' + JSON.stringify(B.B4) + ' | B5 ' + JSON.stringify(B.B5.slice(0, 5)));
  console.log('B6 ' + JSON.stringify(B.B6) + ' | B7 ' + JSON.stringify(B.B7.map(({ market, ...x }) => x)));
  console.log('B8 ' + JSON.stringify(B.B8.slice(0, 10)) + ' | B9 ' + JSON.stringify(B.B9));
  console.log('T2/T6 ' + JSON.stringify(doc.townGold) + ' | T4 ' + JSON.stringify(B.T4) + ' | T5 ' + JSON.stringify(B.T5) + ' | T7 ' + JSON.stringify(B.T7) + ' | A7 ' + B.A7.length + ' stretches: ' + B.A7.slice(0, 12).join(', '));
  if (!doc.verdicts) return;
  const pick = (v) => doc.verdicts.filter((r) => r.verdict === v);
  console.log('VERDICTS: ' + ['DOMINANT', 'FAILS PURPOSE', 'NEGLECTED', 'HEALTHY'].map((v) => v + ' ' + pick(v).length).join(', '));
  for (const v of ['DOMINANT', 'NEGLECTED', 'FAILS PURPOSE']) {
    for (const r of pick(v).slice(0, full ? 99 : 10)) console.log('  ' + [r.system, r.verdict, r.ruleTripped, r.solverEvidence, r.gridEvidence || 'ground-rates.json MID cells, ' + 'seeds x 1 h', r.change, r.predictedResult, r.rulingsTouched].join(' | '));
  }
}

async function selftest() {
  const t0 = Date.now();
  const fails = [];
  const check = (name, ok, detail) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ': ' + detail : '')); if (!ok) fails.push(name); };
  const band = 'b30-45', sc = { id: 'st', goal: 'bis', party: 1, comp: ['hammer'], payer: 'free', townH: 12, bands: [band] };
  /* control */
  const c0 = await setup({ quick: true, beam: 1, maxDays: 120 });
  const r0 = playScenario(c0, sc);
  const target = r0.bands[0].fills.filter((f) => f.system === 'loot' && !f.item.startsWith('temper:')).sort((a, b) => b.days - a.days)[0];
  check('control: the band has a dropped piece to plant against', !!target, target ? target.item + ' ' + r2(target.days) + ' d' : 'none');
  if (!target) return finish();
  const v0 = judge({ runs: [r0], atlas: c0.atlas, rules: VERDICT_RULES, systemIds: [] }).rows;
  check('control: no planted system is judged', !v0.some((r) => /^zz/.test(r.system)));
  /* plant: a recipe 10x better than the piece's best route (skill zzforge), one 10x worse (skill zzidle), and an item with no source */
  const D = await loadData();
  const hours = (f) => f * target.days * 12 * 3600 * 1000;   // a bench job in ms worth f x the piece's days (a lone hero, 12 rested hours)
  D.RECIPES.zzforge = [{ id: 'zz_fast', name: 'Planted fast', inputs: {}, output: target.item, xp: 1, req: 1, ms: hours(0.1) }];
  D.RECIPES.zzidle = [{ id: 'zz_slow', name: 'Planted slow', inputs: {}, output: target.item, xp: 1, req: 1, ms: hours(10) }];
  D.ITEMS.zz_orphan = { n: 'Planted Orphan', type: 'jewelry', slot: 'ring', v: 1 };
  const c1 = await setup({ quick: true, beam: 1, maxDays: 120, D });
  check('atlas: the planted item with no source is listed', c1.atlas.lists.noSource.some((x) => x.id === 'zz_orphan'));
  const r1 = playScenario(c1, sc);
  const v1 = judge({ runs: [r1], atlas: c1.atlas, rules: VERDICT_RULES, systemIds: [] }).rows;
  const fast = v1.find((r) => r.system === 'zzforge'), slow = v1.find((r) => r.system === 'zzidle');
  check('a recipe 10x better reads DOMINANT', fast && fast.verdict === 'DOMINANT', fast ? fast.verdict + ' (' + fast.ruleTripped + ')' : 'not judged');
  check('a recipe 10x worse reads NEGLECTED', slow && slow.verdict === 'NEGLECTED', slow ? slow.verdict + ' (' + slow.ruleTripped + ')' : 'not judged');
  check('every row carries the eight report fields', v1.every((r) => VERDICT_RULES.reportFields.every((k) => r[k] !== undefined && r[k] !== '')));
  return finish();
  function finish() {
    console.log((fails.length ? 'SELFTEST RED: ' + fails.join(', ') : 'selftest green: the dominant and the neglected plant are each named, the orphan is listed') + ' (' + (Date.now() - t0) + ' ms)');
    process.exit(fails.length ? 1 : 0);
  }
}

if (isMain(import.meta.url)) main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
