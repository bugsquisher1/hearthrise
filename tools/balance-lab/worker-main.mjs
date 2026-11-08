// tools/balance-lab/worker-main.mjs — THE LAB'S WORKER: plays the page's jobs on the bundled engine, off its thread.
//
// build.mjs wraps this file and its graph into dist/worker.js. Inside a Web Worker it answers messages; loaded as a
// plain page script (a host where no worker can start) it leaves globalThis.HearthriseLab = { handle(msg, post) } and the
// page drives the same handler on its own thread. Every message carries the page's `id`; every answer echoes it.
//
//   { type: 'meta' }                          -> { type: 'meta', bundle, grounds, styles, gearPresets, tiers: { ground: defaults },
//                                                  sheetTiers, hasSheet, sheetSource, hasScaled }
//   { type: 'scale', ground, leaderLevel }    -> { type: 'scale', info } (dials.mjs scaleInfo: the game's scaled hunt, or why not)
//   { type: 'hero', style, level, gear }      -> { type: 'hero', card: { pieces, maxHp, maxMana } }
//   { type: 'play', cell, seeds, dials }      -> { type: 'progress', f } ... then { type: 'played', totals, ms }
//                                                  (the dials move the engine's rows for this job only, and are put back)
//   { type: 'summary', cell, dials, parts, ctx, solo, normal } -> { type: 'summary', run, grade } (targets.mjs grade's extra reads)
// A cell's pull is decided HERE (cell.density when the caller names one): the dials' tier row for the party's size, or the
// game's scaled tier row on a scaled hunt (dials.mjs runTierRow), so the page never restates a tier.
//   any failure                                -> { type: 'error', message }
import { playCell, mergeTotals, summarise, grounds, styles, heroCard, GEAR_PRESETS, gearOpts, ENGINE_VERSION } from './lab-core.mjs';
import { applyDials, tierDefaults, sheetTierDials, hasSheet, hasScaled, scaleInfo, runTierRow, effectiveMonsterChange } from './dials.mjs';
import { grade, sheetSource, contractHoursToNext } from './targets.mjs';

const BUNDLE = globalThis.__HEARTHRISE_LAB_BUNDLE__ || { version: ENGINE_VERSION };

function meta() {
  const gs = grounds();
  return { bundle: BUNDLE, grounds: gs, styles: styles(), gearPresets: Object.fromEntries(Object.entries(GEAR_PRESETS).map(([k, v]) => [k, v.label])),
    tiers: Object.fromEntries(gs.map((g) => [g.id, tierDefaults(g.id)])), sheetTiers: Object.fromEntries(gs.map((g) => [g.id, sheetTierDials(g.band[0])])), hasSheet: hasSheet(), sheetSource: sheetSource(), hasScaled: hasScaled(),
    effect: Object.fromEntries(gs.map((g) => [g.id, g.monsters.map((m) => m.id)])) };
}

/** The page's cell (heroes as { style, level, gear }) in the runner's shape, its pull read off the run's tier row. */
function cellOf(c, dials) {
  const tier = c.tier || 'normal';
  const row = Number.isInteger(c.density) ? null : runTierRow(dials || null, c.ground, tier);
  const pull = Number.isInteger(c.density) ? c.density : row ? row.pull[c.heroes.length - 1] : 0;
  return { ground: c.ground, party: c.heroes.map((h) => h.style), level: c.heroes.map((h) => h.level), gearBySeat: c.heroes.map((h) => gearOpts(h.gear)),
    density: pull > 0 ? pull : null, ...(tier !== 'normal' ? { options: { tier } } : {}),
    hours: c.hours, seeds: c.seeds, seedBase: c.seedBase || 0, windowMs: c.windowMs || 30000, supply: c.supply || 'store',
    ...(Number.isInteger(c.eatPct) ? { bar: { eatPct: c.eatPct } } : {}) };
}

export function handle(msg, post) {
  const id = msg && msg.id;
  try {
    if (msg.type === 'meta') { post({ type: 'meta', id, ...meta() }); return; }
    if (msg.type === 'hero') { post({ type: 'hero', id, card: heroCard(msg.style, msg.level, msg.gear) }); return; }
    if (msg.type === 'scale') { post({ type: 'scale', id, info: scaleInfo(msg.ground, msg.leaderLevel) }); return; }
    if (msg.type === 'effect') { post({ type: 'effect', id, effect: effectiveMonsterChange(msg.dials, msg.monsterIds || []) }); return; }
    if (msg.type === 'play') {
      const t0 = Date.now();
      let last = 0;
      const restore = applyDials(msg.dials, { groundId: msg.cell.ground, tier: msg.cell.tier || 'normal' });
      let cell;
      try { cell = cellOf(msg.cell, msg.dials); } catch (e) { restore(); throw e; }
      let totals;
      try {
        totals = playCell(cell, msg.seeds, { onProgress: (f) => { const now = Date.now(); if (now - last > 120) { last = now; post({ type: 'progress', id, f }); } } });
      } finally { restore(); }
      post({ type: 'played', id, totals, ms: Date.now() - t0 });
      return;
    }
    if (msg.type === 'summary') {
      const cell = cellOf(msg.cell, msg.dials);
      const run = summarise(cell, mergeTotals(msg.parts));
      for (const h of run.heroes) h.lab.contractHoursToNext = Math.round(contractHoursToNext(h.level) * 100) / 100;
      post({ type: 'summary', id, run, grade: grade(run, msg.ctx || {}, { solo: msg.solo || null, normal: msg.normal || null }) });
      return;
    }
    throw new Error('balance-lab worker: unknown message ' + (msg && msg.type));
  } catch (e) {
    post({ type: 'error', id, message: String((e && e.message) || e), stack: String((e && e.stack) || '') });
  }
}

/* a worker answers messages; a page that loaded this as a script gets the handler; node (engine.js's importers) gets neither */
const inWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;
if (inWorker) self.onmessage = (e) => handle(e.data, (m) => self.postMessage(m));
else if (typeof window !== 'undefined') globalThis.HearthriseLab = { handle };
