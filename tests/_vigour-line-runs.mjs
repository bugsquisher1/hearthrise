// ============================================================================
// tests/_vigour-line-runs.mjs — THE ONE SPAN AND THE 90 s CHAIN
// tests/world-tick-vigour-line.mjs REPLAYS, AS PURE FUNCTIONS OF
// (engine directory, probe, seed index).
//
// Moved out of the guard verbatim (2026-10-08, db-replay-5 cancelled at its
// 20-min timeout with this guard mid-run, run 37725703255) so its 300-seed
// replays can run across worker threads (tools/world-tick-replay-pool.mjs).
// `pair(base, probe, i)` loads the engine under `base` (the repo, or a mutant's
// temp copy) and returns exactly what the guard's serial loop computes for
// seed i, so a pooled replay IS the serial one.
//
// No network, no database, no credential.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* hr_state_of at version 103 (ENV), as the tick's session builder sees it
   before the shadow overlay (sessionFromRoster), and the carriers at the two
   span starts. Pointer/watermark keys are overwritten per window by
   `session()`. The bytes live in services/world-tick/fixtures/vigour-line-qa1.json
   so tools/world-tick-parity.mjs --selftest replays the SAME no-food input. */
export const QA1 = JSON.parse(readFileSync(join(ROOT, 'services', 'world-tick', 'fixtures', 'vigour-line-qa1.json'), 'utf8'));
export const ENV = Object.freeze(QA1.env);
export const PROBES = Object.freeze(QA1.probes);

export const sumMap = (m) => Object.values(m || {}).reduce((a, b) => a + Number(b), 0);

/* The engine under `base`: the modules the arms read, plus `base` itself so a
   replay can be re-run from the same directory in a worker. */
export async function load(base) {
  const at = (p) => import(pathToFileURL(join(base, p)).href);
  const [probe, combat, contract, rng, sim] = await Promise.all([
    at('supabase/functions/hr-accrue/tick-probe.js'),
    at('supabase/functions/hr-accrue/tick-combat.js'),
    at('supabase/functions/hr-accrue/tick-contract.js'),
    at('src/core/rng.js'),
    at('src/core/combat-sim.js'),
  ]);
  /* The rate the ENGINE reads (combat-sim re-exports away.js's constant). */
  return { ...probe, ...combat, ...contract, ...rng, AWAY_RATE_MULT: sim.AWAY_RATE_MULT, base };
}

export function session(L, i, markMs, markText, carrier) {
  const s = JSON.parse(JSON.stringify(ENV));
  s.userId = `00000000-0000-4000-8000-${String(0x610000 + i).padStart(12, '0')}`;
  s.accruedToMs = markMs;
  s.accruedToText = markText;
  return L.applyShadowState(s, JSON.parse(JSON.stringify(carrier)));
}

/* THE ONE SPAN, through the probe's own driver (tick-probe.js oneSpan), on the
   seed of the span's start label — what the accrue path runs. */
export function oneSpanRun(L, p, i) {
  const from = Date.parse(p.fromText); const to = Date.parse(p.to);
  const s = session(L, i, from, p.fromText, p.carrier);
  const r = L.probeResultOf(L.oneSpan('combat', s, from, to, L.offlineSeedFor(s.userId, s.slot, p.fromText)));
  return { ticks: r.ticks, kills: r.kills, gold: r.gold, xp: sumMap(r.xp), deaths: r.deaths, xpk: r.kills ? sumMap(r.xp) / r.kills : 0, gpk: r.kills ? r.gold / r.kills : 0 };
}

/* THE CHAIN, FIRE BY FIRE, as tick.js runs it in shadow: every 90 s window is a
   fresh session from the SAME envelope plus the carrier the previous fire
   stored (applyShadowState -> settleCombatSession -> shadowStateOf). */
export function chainRun(L, p, i) {
  const from = Date.parse(p.fromText); const to = Date.parse(p.to);
  let carrier = p.carrier; let mark = from; let text = p.fromText;
  const intents = [];
  while (mark + 90000 <= to) {
    const s = session(L, i, mark, text, carrier);
    const run = L.settleCombatSession(s, mark, mark + 90000, { cadenceMs: 10000, flushMs: 90000, holder: 'guard' });
    if (run.intents.length === 0) throw new Error(`chain settled nothing at ${new Date(mark).toISOString()}`);
    const it = run.intents[0];
    intents.push(it);
    const end = Date.parse(it.args.p_window_to);
    if (run.watermarkMs !== end) throw new Error('chain ran past its first intent — the carrier would be ahead');
    carrier = JSON.parse(JSON.stringify(L.shadowStateOf(run.char, { baseVersion: ENV.version, atMs: end })));
    mark = end; text = L.pgTimestamptzText(end);
  }
  const v = L.intentValue(intents);
  return { ticks: v.ticks, kills: v.kills, gold: v.gold, xp: sumMap(v.xp), deaths: v.deaths, xpk: v.kills ? sumMap(v.xp) / v.kills : 0, gpk: v.kills ? v.gold / v.kills : 0 };
}

/* THE WORKER TASK: seed i of probe `key` on the engine under `base`. */
const ENGINES = new Map();
export async function pairAsync(base, key, i) {
  if (!ENGINES.has(base)) ENGINES.set(base, await load(base));
  const L = ENGINES.get(base);
  return { one: oneSpanRun(L, PROBES[key], i), chain: chainRun(L, PROBES[key], i) };
}
