// ============================================================================
// tests/world-tick-vigour-line.mjs — A SPAN THAT CROSSES THE VIGOUR LINE PAYS
// IN TIME ORDER, HOWEVER OFTEN IT IS SETTLED
//
//   node tests/world-tick-vigour-line.mjs            green = one span and the 90 s chain agree
//   node tests/world-tick-vigour-line.mjs --mutate   each mutant must turn its arm red (exit 0)
//   node tests/world-tick-vigour-line.mjs --arm VL3  one arm only (iteration; never the gate)
//
// VL1/VL2 parity on the two probes · VL3 the tired payout's RATIO to rested ·
// VL4 the AWAY_RATE_MULT === 1 pin (SEC_VIGOUR_LINE_SPLIT_2026-10-06).
//
// THE MEASUREMENT (production, read-only, 2026-10-06; edge 6205e4e0). The
// first fully-counted combat probes after the b563 defence curve, QA slot 1,
// Slime, no food, three knockouts per 4 h (64-minute rung):
//
//   probe 10  12:39:34 -> 16:40:48  one span 1161 ticks  chain 1649  (+42 %)
//   probe  8  08:39:48 -> 12:41:02  one span  436 ticks  chain  928  (+113 %)
//
// Both inputs are reconstructed EXACTLY, from read-only rows: the envelope is
// player_state/player_skills at version 103 (unchanged across both spans) and
// the carrier at span_from is hr_tick_ownership.shadow_state minus every later
// hr_tick_shadow delta. applyShadowState(ENV, carrier@16:39:19) reproduces the
// stored input of probe 12 key for key, which is the check that the
// reconstruction is the input the probes ran on. Replayed through the shipped
// engine (payload hash equal to the live 6205e4e0), 200-500 seeds per side:
//
//   probe 10 (WHOLLY past the line): one 1124 ± 213, chain 1121 ± 212 ticks,
//     every field within 0.3 %. The live one span sits at z +0.2 and the live
//     chain at z +2.5: chance, in a probe whose ticks are three fight lengths
//     of ten 1-damage hits at a 5 % floor accuracy (per-probe sd of the
//     difference 27 %). VL2 pins that reading.
//   probe 8 (CROSSES the line at ~10:52): chain over one +17.6 % ticks,
//     +20.2 % kills, +15.1 % gold, +15.6 % xp (se ~2.6 %) — a DEFECT. With the
//     Vigour block removed the two agree (+1.0 % ± 1.9 %), so it is Vigour:
//     the one span priced the whole window at ONE time-weighted blend, while
//     the design (HUNTS_AND_ANALYZER §4.3) and the chain spend the budget in
//     time order. The knockout cycle makes earning non-uniform in time (the
//     span opens with 51 minutes of recovery that burn full-rate minutes), so
//     the blend under-paid the two rested fights and over-paid the tired one,
//     and since b563 it also LEVELLED the fight at the blend. That is the
//     live accrue path. Fixed in accrual.js (`vigMultAt`): each payout reads
//     1 or VIGOUR_DRY_MULT at the tick it was earned on. After: +0.7 % ± 1.7 %
//     ticks, -0.1 % ± 1.4 % gold and xp (500 seeds).
//
// The user id is synthetic and the seeds are the offline `hashSeed` stream
// (hr_seed's secret is not readable and must not be). Exit: 0 green (or,
// under --mutate, every mutant caught) · 1 red · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { QA1, ENV, PROBES, sumMap, load, session, oneSpanRun, chainRun } from './_vigour-line-runs.mjs';
import { poolMap } from '../tools/world-tick-replay-pool.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const ONLY = (() => { const i = process.argv.indexOf('--arm'); return i >= 0 ? process.argv[i + 1] : null; })();
/* Seeds per side. Deterministic (a fixed seed set), so a pass is a pass; 150
   puts the post-fix worst field ~3 standard errors inside the bar and the
   pre-fix defect ~3 outside it. */
const N = 300;
/* Security's combat bar is ±10 % on a 12-probe aggregate (SEC_WORLD_TICK_ARM);
   these are EXPECTATIONS over 150 seeds of one input, so the band is tighter. */
const BAR_PCT = 6;
const Z_MAX = 3.29;     // two-sided p = 0.001

/* THE ENGINE THE LIVE PROBES RAN ON. Probe 10's `live` pair was journalled on
   edge payload 6205e4e0, which paid hit XP on the ROLLED swing (overkill
   included). The engine under test pays it on damage DEALT (combat-sim.js
   simulateTick, game-designer ruling 2026-10-07). The recorded pair is judged
   against the repo engine with exactly that rule restored — the one
   difference between the two payloads that reaches this fixture — and VL2b
   proves that rule is the only delta. Post-deploy probes are recorded on the
   new payload; when this fixture is re-measured, drop these edits (VL5 says
   when).
   THE PATCH IS PROVEN, NOT ASSERTED: the patched combat-sim.js must hash to
   RECORDED_SRC_SHA256 = sha256(`git show 0c07f85f:src/core/combat-sim.js`),
   the b563 release commit whose hr-accrue pack is 6205e4e0 (the ?v= stamps
   are restored to 563 for that reason). A combat-sim.js change that lands
   after this pin and is not part of the recorded engine makes mutantBase
   refuse the patch (exit 2) instead of replaying a hybrid. */
const RECORDED_ON = '6205e4e0';
const RECORDED_SRC_SHA256 = '310668a167336c52485424df32f05855188ad202695fb8159eae51e1f9c2d071';
const RECORDED_ENGINE = {
  name: `payload ${RECORDED_ON}: hit XP on the rolled swing`,
  file: 'src/core/combat-sim.js',
  edits: [
    ['  /* XP IS EARNED ON DAMAGE DEALT (design ruling). The swing may roll\n'
      + '     past the foe\'s remaining HP — overkill, crits included — but only the\n'
      + '     HP it actually removed pays hit XP, styled and hitpoints alike. Without\n'
      + '     the clamp a maxed hitter earned ~4 XP per wasted point on a slime. */\n'
      + '  const hpBefore = Math.max(0, state.monsterHp);\n'
      + '  const xpDmg = Math.min(pDmg, hpBefore);\n', ''],
    ['if (xpDmg > 0) {', 'if (pDmg > 0) {'],
    ['hitXpRoute(ctx.style, xpDmg)', 'hitXpRoute(ctx.style, pDmg)'],
  ],
  stampV: '563',
  sha256: RECORDED_SRC_SHA256,
};

/* VL5's pin: the hr-accrue payload production serves, as the Coordinator
   recorded it at the last edge deploy (CLAUDE.md §3.3: deploy, then verify the
   live payload_sha256). A CONSTANT, read in CI — this guard never calls prod.
   Bump it in the same commit that records a deploy. */
const LIVE_PAYLOAD_PIN = '6205e4e0';

const MUTANTS = [
  /* The dealt-damage rule reverted in the engine under test: it then equals
     the recorded payload's engine, so VL2b must see no XP delta. */
  {
    name: 'VL-M7 overkill XP paid again', arm: 'VL2b',
    file: 'src/core/combat-sim.js',
    edits: [['hitXpRoute(ctx.style, xpDmg)', 'hitXpRoute(ctx.style, pDmg)']],
  },
  {
    name: 'VL-M1 one blend for the whole span (the engine before this fix)', arm: 'VL1',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['const vigLineMs = vigDry ? credit.fromMs + vigSplit.fullMs : Infinity;',
        'const vigLineMs = vigDry ? credit.fromMs : Infinity;\n'
        + '  const vigBlend = vigDry ? (vigSplit.fullMs + vigSplit.dryMs * VIGOUR_DRY_MULT) / (vigSplit.fullMs + vigSplit.dryMs) : 1;'],
      ['const vigMultAt = (atMs) => (vigDry && atMs >= vigLineMs ? VIGOUR_DRY_MULT : 1);',
        'const vigMultAt = (atMs) => (vigDry && atMs >= vigLineMs ? vigBlend : 1);'],
      ['const vigMult = VIGOUR_DRY_MULT;', 'const vigMult = vigBlend;'],
    ],
  },
  {
    name: 'VL-M2 the dry part at the FRONT of the window', arm: 'VL1',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['const vigMultAt = (atMs) => (vigDry && atMs >= vigLineMs ? VIGOUR_DRY_MULT : 1);',
        'const vigMultAt = (atMs) => (vigDry && atMs < credit.fromMs + vigSplit.dryMs ? VIGOUR_DRY_MULT : 1);'],
    ],
  },
  {
    name: 'VL-M3 gold scaled whole, not split at the line', arm: 'VL1',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['const goldFull = (!vigDry || vigGoldAtLine === null) ? goldAll : Math.min(goldAll, vigGoldAtLine);',
        'const goldFull = !vigDry ? goldAll : 0;'],
    ],
  },
  /* The two OVERPAY mutants Security found passing every vigour guard
     (SEC_VIGOUR_LINE_SPLIT_2026-10-06, "Condition"): C5, W1-W4, vigour.mjs and
     VL1 are all parity arms, and a defect that overpays the one span AND the
     chain by the same factor keeps them in parity. Only a ratio against the
     rested payout can see it (VL3). */
  {
    name: 'VL-M4 the tired multiplier is always 1 (dry XP pays rested)', arm: 'VL3',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['const vigMultAt = (atMs) => (vigDry && atMs >= vigLineMs ? VIGOUR_DRY_MULT : 1);',
        'const vigMultAt = (atMs) => 1;'],
    ],
  },
  {
    name: 'VL-M5 gold never splits at the line (dry gold pays rested)', arm: 'VL3',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['const goldFull = (!vigDry || vigGoldAtLine === null) ? goldAll : Math.min(goldAll, vigGoldAtLine);',
        'const goldFull = goldAll;'],
    ],
  },
  /* THE RULING'S 2x OVERPAY (SEC_VIGOUR_LINE_SPLIT_2026-10-06 "Condition":
     "a 2x overpay would pass undetected" by the parity arms; SEC_PROBE_RETAIN
     B3 asks VL3 to prove it). Tired XP AND gold pay twice VIGOUR_DRY_MULT:
     per kill 0.50 of rested, outside [0.22, 0.28]. */
  {
    name: 'VL-M8 tired pays 2x VIGOUR_DRY_MULT (xp and gold)', arm: 'VL3',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['const vigMultAt = (atMs) => (vigDry && atMs >= vigLineMs ? VIGOUR_DRY_MULT : 1);',
        'const vigMultAt = (atMs) => (vigDry && atMs >= vigLineMs ? 2 * VIGOUR_DRY_MULT : 1);'],
      ['const vigMult = VIGOUR_DRY_MULT;', 'const vigMult = 2 * VIGOUR_DRY_MULT;'],
    ],
  },
  /* The latent LOW: tick instants are seg.fromMs + i·tickMs with
     n = ms·rate/tickMs, so a rate below 1 compresses the ticks ahead of the
     wall clock and the line lands late, in the player's favour (VL4). */
  {
    name: 'VL-M6 AWAY_RATE_MULT drops to 0.8', arm: 'VL4',
    file: 'src/core/away.js',
    edits: [['export const AWAY_RATE_MULT = 1.00;', 'export const AWAY_RATE_MULT = 0.80;']],
  },
];

async function mutantBase(m) {
  const base = await mkdtemp(join(tmpdir(), 'hr-wtvl-'));
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'),
    join(base, 'supabase', 'functions', 'hr-accrue'), { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  const path = join(base, m.file);
  let src = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
  for (const [from, to] of m.edits) {
    if (!src.includes(from)) {
      console.error(`--mutate ${m.name}: marker gone from ${m.file} — "${from}"`);
      process.exit(2);
    }
    src = src.split(from).join(to);
  }
  if (m.stampV) src = src.replace(/\?v=\d+'/g, `?v=${m.stampV}'`);
  if (m.sha256) {
    const got = createHash('sha256').update(src, 'utf8').digest('hex');
    if (got !== m.sha256) {
      console.error(`${m.name}: the patched ${m.file} hashes ${got}, not the recorded engine's ${m.sha256} — `
        + 'combat-sim.js changed in a way the patch does not undo; re-derive the patch or re-record the probe');
      process.exit(2);
    }
  }
  await writeFile(path, src, 'utf8');
  return base;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE TWO INPUTS (see the header for how they were reconstructed) and the
// one span / chain runs live in tests/_vigour-line-runs.mjs, so a replay can be
// spread over worker threads; this file keeps the arms and the mutants.
// ═══════════════════════════════════════════════════════════════════════════

const FIELDS = ['ticks', 'kills', 'gold', 'xp'];

/* VL3's input: probe 10's span and carrier with the chain's Vigour counters
   stripped, so the ENVELOPE's `spent_min` alone places the line. Same seed i
   on every Vigour state, so the three runs differ only in where the line is. */
function vigourOneSpan(L, p, i, spentMin) {
  const from = Date.parse(p.fromText); const to = Date.parse(p.to);
  const carrier = JSON.parse(JSON.stringify(p.carrier));
  delete carrier.vigour_rem_ms; delete carrier.vigour_spent_min;
  const s = session(L, i, from, p.fromText, carrier);
  s.vigour = Object.assign({}, s.vigour, { spent_min: spentMin });
  const r = L.probeResultOf(L.oneSpan('combat', s, from, to, L.offlineSeedFor(s.userId, s.slot, p.fromText)));
  return { gold: r.gold, xp: sumMap(r.xp), kills: r.kills };
}

function stats(rows, f) {
  const m = rows.reduce((a, r) => a + r[f], 0) / rows.length;
  const sd = Math.sqrt(rows.reduce((a, r) => a + (r[f] - m) ** 2, 0) / Math.max(1, rows.length - 1));
  return { m, sd };
}

/* One replay per (engine, probe): VL2 and VL2b read the same distribution.
   `prefetch` runs the N seeds of every replay an arm will read across worker
   threads (tools/world-tick-replay-pool.mjs; same seeds, same order, the same
   pure runs) before the arms run; a replay nobody prefetched is run here,
   serially, exactly as before. */
const REPLAYS = new WeakMap();
const keyOfProbe = (p) => Object.keys(PROBES).find((k) => PROBES[k] === p);
const RUNS = new URL('./_vigour-line-runs.mjs', import.meta.url).href;
function replay(L, p) {
  const byP = REPLAYS.get(L) || new Map(); REPLAYS.set(L, byP);
  if (!byP.has(p)) {
    const one = []; const chain = [];
    for (let i = 0; i < N; i++) { one.push(oneSpanRun(L, p, i)); chain.push(chainRun(L, p, i)); }
    byP.set(p, replayStatsOf(one, chain));
  }
  return byP.get(p);
}
async function prefetch(pairs) {
  const todo = pairs.filter(([L, p], j) => !(REPLAYS.get(L) || new Map()).has(p)
    && pairs.findIndex(([L2, p2]) => L2 === L && p2 === p) === j);
  if (!todo.length) return;
  const tasks = todo.flatMap(([L, p]) => Array.from({ length: N }, (_, i) => [L.base, keyOfProbe(p), i]));
  const out = await poolMap(RUNS, 'pairAsync', tasks);
  todo.forEach(([L, p], j) => {
    const mine = out.slice(j * N, (j + 1) * N);
    const byP = REPLAYS.get(L) || new Map(); REPLAYS.set(L, byP);
    byP.set(p, replayStatsOf(mine.map((x) => x.one), mine.map((x) => x.chain)));
  });
}
/* The replays each arm reads (VL2c and VL3 run their own short loops). */
const NEEDS = {
  VL1: (L) => [[L, PROBES.p8]],
  VL2: (L, X) => [[L, PROBES.p10], [X.rec, PROBES.p10]],
  VL2b: (L, X) => [[L, PROBES.p10], [X.rec, PROBES.p10]],
};
const needsOf = (L, X, only) => Object.entries(NEEDS)
  .filter(([arm]) => !only || arm === only).flatMap(([, f]) => f(L, X));
function replayStatsOf(one, chain) {
  const out = {};
  for (const f of [...FIELDS, 'deaths', 'xpk', 'gpk']) {
    const a = stats(one, f); const b = stats(chain, f);
    const se = Math.sqrt((a.sd ** 2 + b.sd ** 2) / N);
    out[f] = { one: a, chain: b, pct: a.m ? 100 * (b.m / a.m - 1) : 0, sePct: a.m ? 100 * se / a.m : 0 };
  }
  return out;
}

const fmt = (r) => [...FIELDS, 'xpk', 'gpk'].map((f) => `${f} ${r[f].pct >= 0 ? '+' : ''}${r[f].pct.toFixed(1)}%±${r[f].sePct.toFixed(1)}`).join(', ');

/* VL3 seeds per Vigour state (one span only — the engine both paths share). */
const N3 = 40;
/* SEC_VIGOUR_LINE_SPLIT_2026-10-06: wholly past the line pays within
   [0.22, 0.28] of rested (VIGOUR_DRY_MULT 0.25 with the dither's noise). */
const DRY_RATIO = Object.freeze([0.22, 0.28]);

const ARMS = {
  /* VL1 — THE SPAN THAT CROSSES THE LINE (probe 8). The one span and the
     carried 90 s chain must agree in expectation on every payout field, and
     on deaths. Red before the fix: +17.6 % ticks, +15 % gold and xp. */
  VL1(L, fail) {
    const r = replay(L, PROBES.p8);
    for (const f of FIELDS) {
      if (!(Math.abs(r[f].pct) <= BAR_PCT)) {
        fail('VL1', `probe 8 replay (crosses the Vigour line): chain vs one span ${f} `
          + `${r[f].pct.toFixed(1)}% (se ${r[f].sePct.toFixed(1)}%) outside ±${BAR_PCT}% — the one span is not `
          + 'paying the budget in time order (accrual.js vigMultAt). ' + fmt(r));
        return null;
      }
    }
    if (Math.abs(r.deaths.one.m - r.deaths.chain.m) > 0.25) {
      fail('VL1', `probe 8 replay: mean deaths ${r.deaths.one.m.toFixed(2)} vs ${r.deaths.chain.m.toFixed(2)}`);
    }
    return fmt(r);
  },
  /* VL2 — THE SPAN WHOLLY PAST THE LINE (probe 10). Parity in expectation,
     AND the live pair inside the replay's noise: if a change ever made the
     journalled 1161 / 1649 impossible for this input, this arm names it. */
  VL2(L, fail, X) {
    const Lrec = X.rec;
    const p = PROBES.p10;
    const r = replay(L, p);
    /* The live pair is judged against the engine of ITS payload (RECORDED_ON):
       a probe is evidence about the engine that produced it, and the parity
       half above already reads the engine under test. */
    const rr = replay(Lrec, p);
    for (const f of FIELDS) {
      if (!(Math.abs(r[f].pct) <= BAR_PCT)) {
        fail('VL2', `probe 10 replay (wholly tired): chain vs one span ${f} ${r[f].pct.toFixed(1)}% outside ±${BAR_PCT}%. ` + fmt(r));
        return null;
      }
      for (const side of ['one', 'chain']) {
        const z = (p.live[side][f] - rr[f][side].m) / (rr[f][side].sd || 1);
        if (!(Math.abs(z) <= Z_MAX)) {
          fail('VL2', `probe 10 live ${side} ${f} ${p.live[side][f]} is z ${z.toFixed(2)} against its own `
            + `replay on its payload's engine (${rr[f][side].m.toFixed(0)} ± ${rr[f][side].sd.toFixed(0)}) — no longer explained by chance`);
        }
      }
    }
    const zc = (p.live.chain.ticks - rr.ticks.chain.m) / rr.ticks.chain.sd;
    return `${fmt(r)}; live chain ticks z ${zc.toFixed(2)} (on payload ${RECORDED_ON})`;
  },
  /* VL2b — THE ONLY DELTA FROM THE PROBE'S PAYLOAD IS OVERKILL XP. Same input,
     same seeds, the engine under test against the engine the live probe ran
     on: XP must be strictly LOWER on both sides (the dealt-damage rule only
     ever removes overkill), and ticks, kills and gold must agree within the
     parity band (what XP drags through levelling is small; anything larger is
     a second change hiding behind the first). An engine that pays overkill
     again (VL-M7) equals the recorded one and goes red here. */
  VL2b(L, fail, X) {
    const Lrec = X.rec;
    const p = PROBES.p10;
    const r = replay(L, p); const rr = replay(Lrec, p);
    const notes = [];
    for (const side of ['one', 'chain']) {
      const cur = r.xp[side]; const rec = rr.xp[side];
      const se = Math.sqrt((cur.sd ** 2 + rec.sd ** 2) / N);
      if (!(rec.m - cur.m > 3 * se)) {
        fail('VL2b', `probe 10 ${side} xp ${cur.m.toFixed(0)} is not below the recorded payload's ${rec.m.toFixed(0)} `
          + `(se ${se.toFixed(0)}) — the engine pays overkill XP again, or nothing about XP changed`);
      }
      notes.push(`${side} xp ${rec.m.toFixed(0)} -> ${cur.m.toFixed(0)}`);
      for (const f of ['ticks', 'kills', 'gold']) {
        const a = rr[f][side].m; const b = r[f][side].m;
        const pct = a ? 100 * (b / a - 1) : 0;
        if (!(Math.abs(pct) <= BAR_PCT)) {
          fail('VL2b', `probe 10 ${side} ${f} moved ${pct.toFixed(1)}% from the recorded payload's engine `
            + `(${a.toFixed(0)} -> ${b.toFixed(0)}), outside ±${BAR_PCT}% — more than overkill XP changed`);
        }
        notes.push(`${side} ${f} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`);
      }
    }
    return notes.join(', ');
  },
  /* VL2c — PROBE 10 IS WHOLLY PAST THE LINE, PROVEN. VL2 compares a live pair
     recorded on the engine that priced Vigour as ONE blend for the span
     against the time-ordered line, and that is only sound if the two models
     agree on this input. They do exactly when the span never crosses the
     line: the blend of an all-dry window is VIGOUR_DRY_MULT itself. So run
     the blend engine (VL-M1's edits) and the line engine on the same seeds and
     require identical one-span AND chain results on probe 10 — and, as the
     positive control that the comparison can see a difference at all, a
     difference on probe 8, which crosses. */
  VL2c(L, fail, X) {
    const n = 24;
    let same10 = 0; let diff8 = 0;
    for (let i = 0; i < n; i++) {
      const a = JSON.stringify([oneSpanRun(L, PROBES.p10, i), chainRun(L, PROBES.p10, i)]);
      const b = JSON.stringify([oneSpanRun(X.blend, PROBES.p10, i), chainRun(X.blend, PROBES.p10, i)]);
      if (a === b) same10++;
      if (JSON.stringify(oneSpanRun(L, PROBES.p8, i)) !== JSON.stringify(oneSpanRun(X.blend, PROBES.p8, i))) diff8++;
    }
    if (same10 !== n) {
      fail('VL2c', `probe 10: the blended and time-ordered Vigour models disagree on ${n - same10}/${n} seeds — `
        + 'the span is not wholly past the line, so the recorded live pair cannot stand for the line engine');
    }
    if (diff8 === 0) fail('VL2c', `probe 8 (crosses the line): the two models agree on all ${n} seeds — the comparison is blind`);
    return `probe 10 identical on ${same10}/${n} seeds; probe 8 differs on ${diff8}/${n}`;
  },
  /* VL5 — THE SUNSET TRIPWIRE. VL2 judges probe 10 on RECORDED_ENGINE, a
     reconstruction of payload RECORDED_ON. Once production serves another
     payload, new probes exist on the shipped engine and this one should be
     re-recorded (and RECORDED_ENGINE deleted). Red when the pinned live
     payload is not the one the fixture was recorded on. */
  VL5(L, fail) {
    const why = sunsetCheck(LIVE_PAYLOAD_PIN, QA1.recorded_on, RECORDED_ON);
    if (why) { fail('VL5', why); return null; }
    /* The tripwire's own tooth, run every time: a moved pin must trip it. */
    if (!sunsetCheck('ffffffff', QA1.recorded_on, RECORDED_ON)) fail('VL5', 'sunsetCheck passed a moved pin — the tripwire is blind');
    return `live pin ${LIVE_PAYLOAD_PIN} = fixture recorded_on ${QA1.recorded_on}`;
  },
  /* VL3 — THE RATIO ARM. VL1/VL2 are parity arms: an engine that overpays the
     one span and the chain alike stays in parity, and VL-M4/VL-M5 (4x tired
     overpay) passed every vigour guard; VL-M8 is the ruling's 2x. Here the SAME input and seeds run
     rested (spent 0), crossing (the line two hours in) and wholly past it
     (spent = budget).
     THE BAND IS READ PER KILL. Since b563 the fight levels off BANKED xp, so a
     tired span levels slower and fights fewer kills: on this low-level input
     wholly-tired kills are 0.86 of rested (0.66 on probe 8's carrier) and the
     TOTAL gold/xp ratio is 0.214, a correct engine outside [0.22, 0.28]. That
     drag is the simulation, not the multiplier, so:
       • gold/kill and xp/kill, wholly past / rested, inside DRY_RATIO;
       • total gold and xp, wholly past / rested, never ABOVE DRY_RATIO's top
         (the overpay direction is still read on the payout itself);
       • a crossing window's total strictly between wholly past and rested. */
  VL3(L, fail) {
    const p = PROBES.p10;
    const budget = Number(ENV.vigour.budget_min);
    const spanMin = (Date.parse(p.to) - Date.parse(p.fromText)) / 60000;
    if (!(budget > 120 && spanMin > 120)) { fail('VL3', `fixture cannot place a crossing line (budget ${budget}, span ${spanMin} min)`); return null; }
    const state = { rested: 0, crossing: budget - 120, past: budget };
    const mean = {};
    for (const [k, spent] of Object.entries(state)) {
      const rows = [];
      for (let i = 0; i < N3; i++) rows.push(vigourOneSpan(L, p, i, spent));
      mean[k] = { gold: stats(rows, 'gold').m, xp: stats(rows, 'xp').m, kills: stats(rows, 'kills').m };
    }
    if (!(mean.rested.kills > 0 && mean.past.kills > 0)) { fail('VL3', 'the fixture fought no kills — nothing to price'); return null; }
    const notes = [];
    for (const f of ['gold', 'xp']) {
      const perKill = (mean.past[f] / mean.past.kills) / (mean.rested[f] / mean.rested.kills);
      const total = mean.past[f] / mean.rested[f];
      notes.push(`${f}/kill ${perKill.toFixed(3)} total ${total.toFixed(3)} crossing ${(mean.crossing[f] / mean.rested[f]).toFixed(3)}`);
      if (!(perKill >= DRY_RATIO[0] && perKill <= DRY_RATIO[1])) {
        fail('VL3', `wholly-tired ${f} per kill pays ${perKill.toFixed(3)} of rested (${N3} seeds) — outside `
          + `[${DRY_RATIO.join(', ')}]: past the Vigour line is not paying VIGOUR_DRY_MULT`);
      }
      if (!(total <= DRY_RATIO[1])) {
        fail('VL3', `wholly-tired total ${f} is ${total.toFixed(3)} of rested (${mean.past[f].toFixed(1)} / `
          + `${mean.rested[f].toFixed(1)}) — above ${DRY_RATIO[1]}: a tired span overpays`);
      }
      if (!(mean.past[f] < mean.crossing[f] && mean.crossing[f] < mean.rested[f])) {
        fail('VL3', `a crossing window's ${f} (${mean.crossing[f].toFixed(1)}) is not strictly between wholly tired `
          + `(${mean.past[f].toFixed(1)}) and rested (${mean.rested[f].toFixed(1)})`);
      }
    }
    return `${N3} seeds: ${notes.join('; ')}; kills past/rested ${(mean.past.kills / mean.rested.kills).toFixed(3)}`;
  },
  /* VL4 — THE RATE PIN (SEC_VIGOUR_LINE_SPLIT_2026-10-06, "Latent"). The line
     is an instant compared against tick instants seg.fromMs + i·tickMs, with
     n = ms·rate/tickMs. Below rate 1 the ticks run ahead of the wall clock and
     the line lands late, in the player's favour. Pinned rather than mapped:
     changing the rate must first map the instants through it. */
  VL4(L, fail) {
    if (L.AWAY_RATE_MULT !== 1) {
      fail('VL4', `AWAY_RATE_MULT is ${L.AWAY_RATE_MULT}, not 1 — the Vigour line is compared against tick `
        + 'instants that a rate below 1 compresses ahead of the wall clock; map the instants through the rate first');
      return null;
    }
    return 'AWAY_RATE_MULT === 1 (as the engine imports it)';
  },
};

function sunsetCheck(livePin, fixtureOn, engineOn) {
  if (fixtureOn !== engineOn) return `fixture recorded_on ${fixtureOn} but RECORDED_ENGINE reconstructs ${engineOn} — update both together`;
  if (livePin !== fixtureOn) {
    return `production serves payload ${livePin} but probe 10 was recorded on ${fixtureOn}: re-record probe 10 on the live `
      + 'payload (vigour-line-qa1.json probes.p10 + recorded_on), then delete RECORDED_ENGINE and VL2b';
  }
  return null;
}

async function runArms(L, only, X) {
  const fails = [];
  const fail = (arm, msg) => { fails.push(`${arm}: ${msg}`); };
  for (const [name, arm] of Object.entries(ARMS)) {
    if (only && name !== only) continue;
    const before = fails.length;
    let note = '';
    try { note = arm(L, fail, X) || ''; } catch (e) { fail(name, `threw: ${e.stack || e.message}`); }
    if (fails.length === before) console.log(`  ok  ${name}  ${note}`);
  }
  return fails;
}

/* The two reference engines every arm may read: the recorded payload's and
   the blended-Vigour one (VL-M1's edits, the engine before the line fix). */
async function refs() {
  const blend = MUTANTS.find((m) => m.name.startsWith('VL-M1 '));
  return { rec: await load(await mutantBase(RECORDED_ENGINE)), blend: await load(await mutantBase(blend)) };
}

async function main() {
  if (!MUTATE) {
    console.log(`world-tick-vigour-line (${N} seeds per side)`);
    const L = await load(ROOT);
    const X = await refs();
    await prefetch(needsOf(L, X, ONLY));
    const fails = await runArms(L, ONLY, X);
    for (const f of fails) console.log(`  ✗ ${f}`);
    console.log(fails.length ? `world-tick-vigour-line: RED (${fails.length})` : 'world-tick-vigour-line: green');
    process.exit(fails.length ? 1 : 0);
  }
  console.log('world-tick-vigour-line --mutate');
  let escaped = 0;
  const X = await refs();
  /* Every mutant's engine first, so all their replays share one pool run. */
  const engines = [];
  for (const m of MUTANTS) engines.push(await load(await mutantBase(m)));
  await prefetch(MUTANTS.flatMap((m, j) => needsOf(engines[j], X, m.arm)));
  for (const [j, m] of MUTANTS.entries()) {
    const fails = await runArms(engines[j], m.arm, X);
    const caught = fails.some((f) => f.startsWith(`${m.arm}:`));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  ${m.name} -> ${m.arm}${caught ? '' : ' stayed green'}`);
    if (caught) console.log(`           ${fails[0].slice(0, 420)}`);
    if (!caught) escaped++;
  }
  console.log(escaped ? `--mutate: ${escaped} mutant(s) ESCAPED` : '--mutate: every mutant caught');
  process.exit(escaped ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
