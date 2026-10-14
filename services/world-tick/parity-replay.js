// ============================================================================
// services/world-tick/parity-replay.js — THE SEEDED REPLAY OF ONE COMBAT PROBE.
//
// SEC_VIGOUR_LINE_SPLIT_2026-10-06.md, "Bar ruling": the ±10 % combat bar is
// applied to the seeded REPLAY EXPECTATION of each probe's input, never to the
// realised pair (per-probe sd ≈ 27 % on a death-dominated probe, so a fixed
// ±10 % on 12 realised probes false-fails ~20 % of correct reads). The realised
// pair is judged by z against its OWN replay distribution.
//
// One probe, R replicas. Replica r runs BOTH sides through the shipped engine
// from the stored input on its own seed family — the one span through
// tick-probe.js `oneSpan` (what the probe ran), the chain through the shipped
// fire-by-fire shadow composition (`shippedChain`, below) — so the per-replica
// difference chain_r − one_r is a draw from the distribution the live pair is
// one draw of. `reproduced` re-runs the one span on the probe's OWN seed and
// compares it with the stored result byte for byte (canonical JSON): the check
// that the engine replayed is the engine that produced the probe.
//
// Replica seeds are `hashSeed(user, slot, 'replay#<r>|' + seedLabelFor(text))`
// — a distinct, deterministic stream per (replica, window label), labelled the
// accrue path's way (T-2). Never Math.random, never hr_seed's secret.
//
// ONE COMPOSITION, ANY PAYLOAD'S ENGINE (2026-10-14, lane c-combat-arm-replay).
// Everything that runs the engine is built by `replayEngine(engine)` over the
// eight engine entry points it calls (ENGINE_ENTRY_POINTS); this module's own
// exports are that factory bound to THIS checkout's engine — the same
// functions they always were. tests/world-tick-combat-replay.mjs binds the
// SAME composition to the engine of a probe's OWN payload (extracted from git,
// its pack hash checked, tools/lib/engine-pack.mjs), so a probe is replayed on
// the code that recorded it and the composition is never written twice.
//
// Pure: no I/O, no clock, no randomness. Callers: tools/world-tick-parity.mjs
// (production rows + --selftest), tests/world-tick-probe-bar.mjs,
// tools/lib/engine-pack.mjs (tests/world-tick-combat-replay.mjs).
// ============================================================================

import * as probeMod from '../../supabase/functions/hr-accrue/tick-probe.js';
import * as combatMod from '../../supabase/functions/hr-accrue/tick-combat.js';
import * as contractMod from '../../supabase/functions/hr-accrue/tick-contract.js';
import * as rngMod from '../../src/core/rng.js';

/* Production's geometry (hr_tick_config cadence_seconds / flush_seconds,
   tick.js MAX_POLLS). */
export const REPLAY_GEOMETRY = Object.freeze({ cadenceMs: 10000, flushMs: 90000, maxPolls: 64 });

/* Every field the combat bar reads off a replay. */
export const REPLAY_FIELDS = Object.freeze(['ticks', 'kills', 'gold', 'xp', 'deaths', 'ate']);

/* The engine entry points the composition calls, by module. An engine that
   lacks one is REFUSED (engineOf throws), never patched from another engine. */
export const ENGINE_ENTRY_POINTS = Object.freeze({
  probe: Object.freeze(['oneSpan', 'probeResultOf']),
  combat: Object.freeze(['settleCombatSession', 'pgTimestamptzText', 'seedLabelFor']),
  contract: Object.freeze(['shadowStateOf', 'applyShadowState']),
  rng: Object.freeze(['hashSeed']),
});

/* { probe, combat, contract, rng } module namespaces → the engine. */
export function engineOf(mods) {
  const eng = {};
  for (const [m, names] of Object.entries(ENGINE_ENTRY_POINTS)) {
    for (const n of names) {
      const f = mods && mods[m] && mods[m][n];
      if (typeof f !== 'function') throw new Error(`parity-replay: the engine has no ${m}.${n}`);
      eng[n] = f;
    }
  }
  return Object.freeze(eng);
}

const sumMap = (m) => Object.values(m || {}).reduce((a, v) => a + (Number(v) || 0), 0);

/* A probe-shaped summary (probeResultOf's fields) → the six bar fields. */
export function fieldsOf(r) {
  const o = r || {};
  return {
    ticks: Number(o.ticks) || 0, kills: Number(o.kills) || 0, gold: Number(o.gold) || 0,
    xp: (o.xp && typeof o.xp === 'object') ? sumMap(o.xp) : (Number(o.xp) || 0),
    deaths: Number(o.deaths) || 0, ate: Number(o.ate) || 0,
  };
}

/* Canonical JSON (sorted keys): jsonb reorders keys, so the stored result is
   compared by content, not by the bytes Postgres hands back. */
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

/* Mean and sample sd of one field over the replicas. */
function moments(xs) {
  const n = xs.length;
  const mean = xs.reduce((a, x) => a + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd };
}

/* Raw samples → the replay record parity-bar.js reads:
   { replicas, reproduced, one:{f:{mean,sd}}, chain:{f:{mean,sd}}, delta:{f:{mean,sd}} }
   `delta` is per replica (chain_r − one_r), never a difference of means, so
   its sd is the spread of the very quantity the live pair realises. */
export function replayStats(samples, reproduced) {
  const out = { replicas: samples.one.length, reproduced, one: {}, chain: {}, delta: {} };
  for (const f of REPLAY_FIELDS) {
    const a = samples.one.map((s) => s[f]);
    const b = samples.chain.map((s) => s[f]);
    out.one[f] = moments(a);
    out.chain[f] = moments(b);
    out.delta[f] = moments(b.map((x, i) => x - a[i]));
  }
  return out;
}

/**
 * The replay composition bound to ONE engine (engineOf's shape).
 * @returns { shippedChain, chainFields, replicaSeedOf, replicaSample, replayProbe }
 */
export function replayEngine(eng) {
  const { oneSpan, probeResultOf, settleCombatSession, pgTimestamptzText, seedLabelFor,
    shadowStateOf, applyShadowState, hashSeed } = eng;

  /* ── THE SHIPPED SHADOW COMPOSITION, FROM A STORED INPUT ─────────────────
     Exactly what production does across fires: each fire builds the session
     from the frozen base, lays the previous fire's carrier over it, and
     settles ONE flush window through the shipped settler. The base is the
     probe's input (the session at span_from, `_`-scratch already dropped by
     encodeProbeInput), so the first carrier is null and every later one is
     relative to the input — the same arithmetic the live chain does relative
     to hr_state_of. Returns { windows: [engine result], endMs }. */
  function shippedChain(input, fromMs, toMs, opts) {
    const o = opts || {};
    const g = Object.assign({}, REPLAY_GEOMETRY, o.geometry || {});
    const windows = [];
    let carrier = null;
    let mark = fromMs;
    let markText = input.accruedToText;
    while (mark < toMs) {
      const base = JSON.parse(JSON.stringify(input));
      base.accruedToMs = mark;
      base.accruedToText = markText;
      const sess = carrier ? applyShadowState(base, carrier) : base;
      const run = settleCombatSession(sess, mark, Math.min(toMs, mark + g.flushMs),
        Object.assign({ cadenceMs: g.cadenceMs, flushMs: g.flushMs, maxPolls: g.maxPolls },
          o.seedOf ? { seedOf: o.seedOf } : {}));
      for (const r of run.results) windows.push(r.res);
      if (run.settled === 0) break;
      carrier = shadowStateOf(run.char, { baseVersion: input.version, atMs: run.watermarkMs });
      mark = run.watermarkMs;
      markText = pgTimestamptzText(mark);
      if (run.stoppedBy === 'activity') break;
    }
    return { windows, endMs: mark };
  }

  /* The chain's summary in probe fields: the sum of every accrued window. */
  function chainFields(windows) {
    const acc = fieldsOf(null);
    for (const res of windows) {
      if (!res || !res.accrued) continue;
      const f = fieldsOf(probeResultOf(res));
      for (const k of REPLAY_FIELDS) acc[k] += f[k];
    }
    return acc;
  }

  /* Replica r's seed family. */
  function replicaSeedOf(userId, slot, r) {
    return (_wmMs, wmText) => hashSeed(String(userId), String(slot), `replay#${r}|${seedLabelFor(wmText)}`);
  }

  /* Replica r of one probe: the one span and the shipped chain on replica r's
     seed family, as bar fields. Deterministic in (p, r), so where it runs (this
     thread or a worker) cannot change what it returns. */
  function replicaSample(p, r) {
    const seedOf = replicaSeedOf(p.input.userId, p.input.slot, r);
    return {
      one: fieldsOf(probeResultOf(
        oneSpan('combat', p.input, p.fromMs, p.toMs, seedOf(p.fromMs, p.input.accruedToText)))),
      chain: chainFields(shippedChain(p.input, p.fromMs, p.toMs, { seedOf }).windows),
    };
  }

  /**
   * Replay one combat probe.
   * @param p { input, fromMs, toMs, seed?, result? }
   *   input   the stored snapshot (decodeProbeInput'd)
   *   seed    the probe's own one-span seed, if it can be known; null otherwise
   *   result  the stored one-span result (hr_tick_probe.result)
   * @param o { replicas, samples? }  samples: replicas 0..R-1 already run
   *   through replicaSample (in order); the reproduction check still runs here
   * @returns { stats, samples, reproduced, reproduceDetail }
   */
  function replayProbe(p, o) {
    const R = Math.max(0, Math.floor((o && o.replicas) || 0));
    /* `o.samples`: the same R replicas computed elsewhere (replicaSample, e.g.
       across worker threads — tools/world-tick-replay-pool.mjs); index r must
       be replica r. Anything else is refused, never re-shaped. */
    const pre = o && o.samples;
    if (pre && !(pre.one.length === R && pre.chain.length === R)) {
      throw new Error(`replayProbe: ${pre.one.length}/${pre.chain.length} precomputed samples for ${R} replicas`);
    }
    const samples = pre || { one: [], chain: [] };
    for (let r = 0; !pre && r < R; r++) {
      const s = replicaSample(p, r);
      samples.one.push(s.one);
      samples.chain.push(s.chain);
    }
    let reproduced = null;
    let reproduceDetail = 'the probe\'s own seed is not known to this reader';
    if (Number.isFinite(p.seed) && p.result) {
      const again = probeResultOf(oneSpan('combat', p.input, p.fromMs, p.toMs, p.seed));
      reproduced = canon(again) === canon(p.result);
      reproduceDetail = reproduced ? 'byte-identical' : `replayed ${canon(fieldsOf(again))} vs stored ${canon(fieldsOf(p.result))}`;
    }
    return { stats: replayStats(samples, reproduced), samples, reproduced, reproduceDetail };
  }

  return Object.freeze({ shippedChain, chainFields, replicaSeedOf, replicaSample, replayProbe });
}

/* THIS checkout's engine. The exports below are the functions every existing
   caller imported by name; `replicaSample` stays a module export because
   tools/world-tick-replay-pool.mjs workers call it by name. */
const HERE = replayEngine(engineOf({ probe: probeMod, combat: combatMod, contract: contractMod, rng: rngMod }));
export const { shippedChain, chainFields, replicaSeedOf, replicaSample, replayProbe } = HERE;
