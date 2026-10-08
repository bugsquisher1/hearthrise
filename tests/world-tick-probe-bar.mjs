#!/usr/bin/env node
// ============================================================================
// tests/world-tick-probe-bar.mjs — THE PROBE COMPARATOR, CALIBRATED AND TOOTHED.
//
//   node tests/world-tick-probe-bar.mjs            calibration + pinned finding
//   node tests/world-tick-probe-bar.mjs --mutate   every ruling mutant must go RED
//   node tests/world-tick-probe-bar.mjs --verbose  print every probe
//
// Security ruling 1 (docs/planning/SEC_WORLD_TICK_ARM_2026-10-05.md),
// "Calibration and teeth (before the first production read counts)":
//   (i)  a fixture arm running THE SAME COMPARATOR over a 4 h span on the C6
//        fixtures, green against the bar;
//   (ii) `--mutate` proofs that the comparator goes RED under fixedSeed,
//        shiftWindow, noAutoEat, freeHeal, skipFoodDebit and a recovery-resume
//        misalignment mutant (the COMBAT-PARITY-RC hypothesis).
// The comparator is services/world-tick/parity-bar.js — the module
// tools/world-tick-parity.mjs reads production with. One bar, calibrated where
// it is read.
//
// ── THE FINDING THIS FILE PINS (PB-2) ───────────────────────────────────────
// Until lane/world-tick-maxhp-carry the SHIPPED shadow composition — one flush
// per fire, the fence's carrier (tick-contract.js shadowStateOf →
// applyShadowState) laid over a frozen hr_state_of between fires — did NOT
// carry `maxHp`, while the ARMED chain (2026-09-06-max-hp-tracks-hitpoints.sql)
// and a single-span accrual (accrual.js) raise it on a Hitpoints level-up. On
// the C6 fixtures normalised to max_hp = hitpoints level that read −13.6 %
// ticks against the one-span answer: a SHADOW-ONLY RED. The carrier now
// carries maxHp, and PB-2 is RE-PINNED (2026-10-05) to the fixed answer: the
// shipped composition must read PASS AND inside ±1 % ticks — the band the
// armed-equivalent model (PB-1) reads. If it drifts out of that band, the
// carrier lost something again; find out what before re-pinning.
//
// ── THE REPLAY BAR (SEC_VIGOUR_LINE_SPLIT_2026-10-06 "Bar ruling") ─────────
// Every probe carries a seeded replay (services/world-tick/parity-replay.js)
// through the engine under test, mutant included: the combat bar reads the
// replay EXPECTATION (±10 % and ≤ 3 se) and the realised read by z. Every
// mutant now goes red on the replay aggregate itself.
//
// ── COST (2026-10-08) ───────────────────────────────────────────────────────
// The replay made this guard ~2 500 chain runs (~0.25 s each): 12.75 min of
// one core in CI (db-replay-5 cancelled at 20 min, run 37725703255). The
// chains are pure functions of a plain spec (tests/_probe-bar-chains.mjs), so
// each distinct one is computed ONCE — PB-1, PB-2 and PB-2p, and every mutant,
// replay the same (fixture, start, span, seed family) runs — across worker
// threads (tools/world-tick-replay-pool.mjs). Same replicas, same fixtures,
// same bars; HR_REPLAY_THREADS=1 is the serial reference and prints the same
// read. The reproduction check is the one thing never remembered: it re-runs
// the one span (`again`) so a non-deterministic engine still reads red.
//
// No network, no database, no credential.
// ============================================================================

import { atSpan } from '../services/world-tick/combat.js';
import { loadGatherSessions, atSpan as gatherAtSpan, settleGatherSession }
  from '../services/world-tick/gather.js';
import { hydrate, seedFor } from '../supabase/functions/hr-accrue/tick-shadow.js';
import { oneSpan, PROBE_SPAN_MS, encodeProbeInput, decodeProbeInput }
  from '../supabase/functions/hr-accrue/tick-probe.js';
import { judgeGroup } from '../services/world-tick/parity-bar.js';
import { replayStats, fieldsOf, canon } from '../services/world-tick/parity-replay.js';
import { MONSTERS } from '../src/data/monsters.js';
import { poolMap } from '../tools/world-tick-replay-pool.mjs';
import { FROM, START_STEP_MS, STARTS, CADENCE_MS, FLUSH_MS, combatFixtures, sumInto, zero,
  shippedShadow, manualChain, MUTANTS } from './_probe-bar-chains.mjs';

const ARGS = process.argv.slice(2);
const MUTATE = ARGS.includes('--mutate');
const VERBOSE = ARGS.includes('--verbose');
/* Seeded replays per probe (SEC_VIGOUR_LINE_SPLIT_2026-10-06 "Bar ruling": the
   combat bar reads each probe's replay expectation). The engine replayed is
   the engine under test, mutant included: a defect in the decomposition moves
   the replay expectation, which is what the bar reads.
   A mutant read must FAIL, which the replay aggregate does at fewer replicas
   (a FAIL is never held back by an INSUFFICIENT). */
const REPLICAS = 12;
const MUTANT_REPLICAS = 8;
const say = (s) => { if (VERBOSE) console.log(s); };

const RARE_IDS = new Set(Object.values(MONSTERS)
  .flatMap((m) => (m.drops || []).filter((d) => d.lucky).map((d) => d.id)));

let problems = 0;
const judge = (id, ok, good, bad) => {
  if (ok) console.log(`  ✓ ${id} — ${good}`);
  else { console.log(`  ✗ ${id} — ${bad}`); problems++; }
};

/* ── EVERY CHAIN AND ONE SPAN, COMPUTED ONCE ────────────────────────────────
   spec = { kind: 'chain' | 'one', chain: 'shipped' | 'manual', muts: [name],
   fx, from, to, salt, again } — see tests/_probe-bar-chains.mjs `task`.
   `again` marks the reproduction re-run: its own key, so it is computed
   fresh and never answered from the memo. */
const TASKS = new URL('./_probe-bar-chains.mjs', import.meta.url).href;
const MEMO = new Map();
const keyOf = (s) => JSON.stringify([s.kind, s.chain || '', s.muts || [], s.fx, s.from, s.to,
  s.salt == null ? null : s.salt, !!s.again]);
async function run(specs) {
  const missing = new Map();
  for (const s of specs) {
    const k = keyOf(s);
    if (!MEMO.has(k) && !missing.has(k)) missing.set(k, s);
  }
  if (missing.size) {
    const todo = [...missing.values()];
    const out = await poolMap(TASKS, 'task', todo.map((s) => [s]));
    todo.forEach((s, i) => MEMO.set(keyOf(s), out[i]));
  }
  return specs.map((s) => structuredClone(MEMO.get(keyOf(s))));
}

/* The (fixture, start) grid every read walks, in the guard's probe order. */
function grid() {
  const out = [];
  combatFixtures().forEach((fx, f) => {
    for (let i = 0; i < STARTS; i++) {
      const from = FROM + i * START_STEP_MS;
      out.push({ f, name: fx.name, i, from, to: from + PROBE_SPAN_MS });
    }
  });
  return out;
}

/* ONE READ: per (fixture, start), the chain under test over the span; the one
   span over [from, chainEnd] on the span start's seed; and THE PROBE'S REPLAY —
   `replicas` draws of (one span, chain) on replica seed families through the
   same engine (`chain` + `muts`, mutant included), plus the reproduction check
   (the one span re-run on the probe's own seed equals the stored result). */
async function buildRead(chain, muts, replicas = REPLICAS) {
  const cells = grid();
  const mains = await run(cells.map((c) => ({ kind: 'chain', chain, muts, fx: c.f, from: c.from, to: c.to })));
  /* A pointer that ENDS inside the span never closes a probe in
     production (the roster drops the character), so it is not one here. */
  const kept = [];
  cells.forEach((c, j) => {
    const { acc, endMs } = mains[j];
    if (endMs - c.from < PROBE_SPAN_MS - FLUSH_MS) return;
    kept.push(Object.assign({ acc, endMs }, c));
  });
  const specs = [];
  for (const k of kept) {
    const at = { fx: k.f, from: k.from, to: k.endMs };
    specs.push({ kind: 'one', ...at }, { kind: 'one', ...at, again: true });
    for (let r = 0; r < replicas; r++) {
      specs.push({ kind: 'one', ...at, salt: r }, { kind: 'chain', chain, muts, ...at, salt: r });
    }
  }
  const res = await run(specs);
  let p = 0;
  let n = 0;
  return kept.map((k) => {
    const one = res[p++];
    const again = res[p++];
    const samples = { one: [], chain: [] };
    for (let r = 0; r < replicas; r++) {
      samples.one.push(fieldsOf(res[p++]));
      samples.chain.push(fieldsOf(res[p++].acc));
    }
    return { id: `${++n}:${k.name.slice(0, 18)}@${k.i}`, spanMs: k.endMs - k.from, discard: null, one, chain: k.acc,
      replay: replayStats(samples, canon(again) === canon(one)) };
  });
}

const sumXp = (m) => Object.values(m || {}).reduce((a, v) => a + v, 0);
function show(probes) {
  for (const p of probes) {
    say(`    ${p.id.padEnd(26)} ticks ${p.one.ticks}/${p.chain.ticks}  kills ${p.one.kills}/${p.chain.kills}`
      + `  gold ${p.one.gold}/${p.chain.gold}  xp ${sumXp(p.one.xp)}/${sumXp(p.chain.xp)}`
      + `  deaths ${p.one.deaths}/${p.chain.deaths}  ate ${p.one.ate}/${p.chain.ate}`);
  }
}

console.log('world-tick-probe-bar: the probe comparator, calibrated on 4 h fixture spans');

// ── PB-0 THE HAND-DRIVEN LOOP IS THE SHIPPED LOOP ──────────────────────────
{
  const fx = combatFixtures()[0];
  const c0 = atSpan(fx, FROM);
  const a = shippedShadow(c0, FROM, FROM + PROBE_SPAN_MS);
  const b = manualChain(c0, FROM, FROM + PROBE_SPAN_MS, {});
  const same = JSON.stringify(a.acc) === JSON.stringify(b.acc) && a.endMs === b.endMs;
  judge('PB-0', same,
    `the mutation loop reproduces the shipped shadow composition exactly (${a.acc.ticks} ticks, ${a.acc.kills} kills)`,
    `the mutation loop and the shipped composition DISAGREE — a mutant measured on it proves nothing\n`
    + `      shipped ${JSON.stringify({ ...a.acc, xp: sumXp(a.acc.xp), items: undefined })}\n`
    + `      manual  ${JSON.stringify({ ...b.acc, xp: sumXp(b.acc.xp), items: undefined })}`);
}

// ── PB-0b THE STORED SNAPSHOT IS THE ENGINE INPUT ──────────────────────────
{
  const fx = combatFixtures()[1];
  const c0 = atSpan(fx, FROM);
  const same = JSON.stringify(hydrate(decodeProbeInput(encodeProbeInput(c0))))
    === JSON.stringify(hydrate(Object.fromEntries(Object.entries(c0).filter(([k]) => !k.startsWith('_')))));
  judge('PB-0b', same, 'hydrate(decode(encode(session))) is byte-identical to hydrate(session)',
    'the stored snapshot is NOT the engine input — a probe would price a different character');
}

// ── PB-0c A REMEMBERED OR WORKER-COMPUTED RUN IS THE SERIAL RUN ───────────
/* The memo and the pool are only sound if `task(spec)` IS the inline
   function: the shipped and hand-driven chains on a replica family and the
   one span, through `run` (pool), equal the same calls made here. */
{
  const fx = combatFixtures()[2];
  const c0 = atSpan(fx, FROM + START_STEP_MS);
  const to = FROM + START_STEP_MS + PROBE_SPAN_MS;
  const at = { fx: 2, from: FROM + START_STEP_MS, to };
  const [s, m] = await run([{ kind: 'chain', chain: 'shipped', ...at, salt: 3 },
    { kind: 'chain', chain: 'manual', muts: ['cal'], ...at, salt: 3 }]);
  const same = canon(s) === canon(shippedShadow(c0, at.from, to, { salt: 3 }))
    && canon(m) === canon(manualChain(c0, at.from, to, { armedMaxHp: true, salt: 3 }));
  judge('PB-0c', same, 'a pooled chain run is byte-identical to the same call made inline',
    'a pooled chain run DIFFERS from the inline call — the memo/pool would read another engine');
}

// ── PB-1 CALIBRATION: the armed-equivalent decomposition is GREEN ──────────
const calProbes = await buildRead('manual', ['cal']);
show(calProbes);
const cal = judgeGroup('combat', calProbes, { rareIds: RARE_IDS });
judge('PB-1', cal.verdict === 'PASS',
  `combat bar PASS on ${cal.stats.probes} probes / ${cal.stats.hours} h `
  + `(ticks ${JSON.stringify(cal.stats.ticks)}, direction ${JSON.stringify(cal.stats.direction)}, `
  + `replay ${JSON.stringify(cal.stats.replay)})`,
  `combat bar ${cal.verdict} on the calibration set:\n      - ${cal.reasons.join('\n      - ')}`);

// ── PB-1z THE PER-PROBE z BAR SITS WHERE IT WAS RULED ─────────────────────
/* SEC_PROBE_RETAIN_2026-10-06 B2: any per-probe |z| > BAR.combat.zProbeMax
   (4.3, Bonferroni over 48) FAILS; the C6 calibration probe at ~−3.5 must stay
   inside it, AND outside 3.29 — the draw that made a 3.29 per-probe bar
   false-fail a correct engine. If it ever drops under 3.29 this pin no longer
   shows the bar's headroom; if it passes 4.3 the calibration is red above. */
{
  const zw = cal.stats.replay && cal.stats.replay.zWorst;
  judge('PB-1z', Number.isFinite(zw) && Math.abs(zw) > 3.29 && Math.abs(zw) <= 4.3,
    `the calibration's worst per-probe z is ${zw}: past 3.29, inside the per-probe FAIL at 4.3`,
    `the calibration's worst per-probe z is ${zw}, not in (3.29, 4.3] — re-read the per-probe bar's calibration`);
}

// ── PB-1g CALIBRATION: gather, six 4 h probes ─────────────────────────────
{
  const probes = [];
  let n = 0;
  for (const raw of loadGatherSessions()) {
    for (let i = 0; i < STARTS; i++) {
      const from = FROM + i * START_STEP_MS;
      const c0 = gatherAtSpan(raw, from);
      const run1 = settleGatherSession(c0, from, from + PROBE_SPAN_MS, { cadenceMs: CADENCE_MS, flushMs: FLUSH_MS });
      const chain = zero();
      for (const r of run1.results) sumInto(chain, r.res);
      const snap = decodeProbeInput(encodeProbeInput(c0));
      const one = sumInto(zero(), oneSpan('gather', snap, from, run1.watermarkMs, seedFor(c0.userId, c0.slot, from)));
      probes.push({ id: `g${++n}`, spanMs: run1.watermarkMs - from, discard: null, one, chain });
    }
  }
  const g = judgeGroup('gather', probes, {});
  judge('PB-1g', g.verdict === 'PASS',
    `gather bar PASS on ${g.stats.probes} probes / ${g.stats.hours} h (qty ${JSON.stringify(g.stats.qty)})`,
    `gather bar ${g.verdict}:\n      - ${g.reasons.join('\n      - ')}`);
}

// ── PB-2 THE PINNED FINDING: the shipped SHADOW composition carries maxHp ──
/* READ ON THE REPLAY EXPECTATION, not the one realised sum. The realised
   chain-vs-one tick sum over 15 single-seed probes has a spread of ~1.5 %
   (one probe alone swings 800 of 53k ticks), so a ±1 % pin on it re-rolls
   whenever the engine's trajectory moves — the dealt-damage XP rule moved it
   from 0.0 % to 1.2 % with no carrier change at all. The expectation over
   REPLICAS seed families (se ~0.3 %) is the quantity a carrier loss moves;
   the realised figure is still printed. --mutate proves the pin bites:
   `dropMaxHp` (the defect PB-2 was written for) must turn it red. */
async function pb2(chain, muts, replicas) {
  const v = judgeGroup('combat', await buildRead(chain, muts, replicas), { rareIds: RARE_IDS });
  const t = v.stats.ticks || { one: 0, chain: 0 };
  const realised = t.one ? ((t.chain - t.one) / t.one) * 100 : NaN;
  const rp = (v.stats.replay || {}).ticks;
  const rel = rp ? rp.rel * 100 : NaN;
  const se = rp ? rp.se * 100 : NaN;
  return { v, realised, rel, se, ok: v.verdict === 'PASS' && Math.abs(rel) <= 1 };
}
{
  const r = await pb2('shipped', []);
  judge('PB-2 (pinned)', r.ok,
    `the shipped shadow composition reads ${r.rel.toFixed(2)}% ± ${r.se.toFixed(2)}% ticks (replay expectation; `
    + `realised ${r.realised.toFixed(1)}%) and the bar is GREEN — the carrier carries max_hp `
    + '(lane/world-tick-maxhp-carry closed the −13.6 % it pinned).',
    `the pin MOVED: the shipped shadow composition now reads ${r.v.verdict} at ${r.rel.toFixed(2)}% ± ${r.se.toFixed(2)}% `
    + `ticks in expectation (realised ${r.realised.toFixed(1)}%; required: PASS inside ±1 %). The carrier has lost `
    + 'something the armed chain keeps — find it.\n      - ' + (r.v.reasons || []).join('\n      - '));
}

// ── PB-2p THE PAIRED READ: shipped shadow minus the ARMED chain, same seeds ──
/* Security (2026-10-07): the ±1 % expectation pin is a coarse instrument. The
   sharp one is PAIRED: the shipped composition and the armed model
   (manualChain armedMaxHp) on the SAME replica seed family r, so the seed
   noise both share cancels. Per replica, Δr = Σticks(shipped) / Σticks(armed)
   − 1 over every calibration probe; PB-2p requires |mean Δ| ≤ 3·se_paired,
   and --mutate requires `dropMaxHp` to read beyond 3·se_paired. */
async function pairedDelta(muts, replicas = REPLICAS) {
  const cells = grid();
  const specs = [];
  for (let salt = 0; salt < replicas; salt++) {
    for (const c of cells) {
      const at = { fx: c.f, from: c.from, to: c.to, salt };
      specs.push(muts ? { kind: 'chain', chain: 'manual', muts, ...at } : { kind: 'chain', chain: 'shipped', ...at },
        { kind: 'chain', chain: 'manual', muts: ['cal'], ...at });
    }
  }
  const res = await run(specs);
  const deltas = [];
  let p = 0;
  for (let salt = 0; salt < replicas; salt++) {
    let a = 0; let b = 0;
    for (let c = 0; c < cells.length; c++) {
      b += res[p++].acc.ticks;
      a += res[p++].acc.ticks;
    }
    deltas.push(a ? b / a - 1 : 0);
  }
  const m = deltas.reduce((x, y) => x + y, 0) / deltas.length;
  const sd = Math.sqrt(deltas.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, deltas.length - 1));
  return { mean: m * 100, se: (sd / Math.sqrt(deltas.length)) * 100, n: deltas.length };
}
if (!MUTATE) {
  const d = await pairedDelta(null);
  /* Capped as well as scaled: a noisy divergence must not pass on its own se
     (Security 2026-10-07); 0.25 % is well inside the −1.19 % dropMaxHp. */
  judge('PB-2p (paired)', Math.abs(d.mean) <= 3 * d.se && Math.abs(d.mean) <= 0.25,
    `shipped − armed ${d.mean.toFixed(3)}% ± ${d.se.toFixed(3)}% ticks over ${d.n} paired seed families (inside 3 se)`,
    `shipped − armed ${d.mean.toFixed(3)}% ± ${d.se.toFixed(3)}% ticks over ${d.n} paired seed families — outside 3 se: `
    + 'or beyond the 0.25 % cap: the shadow carrier diverges from the armed chain on the same dice');
}

if (MUTATE) {
  console.log('\n  mutants (each must turn the calibrated PASS into FAIL)');
  let blind = 0;
  for (const name of Object.keys(MUTANTS)) {
    const probes = await buildRead('manual', ['cal', name], MUTANT_REPLICAS);
    const v = judgeGroup('combat', probes, { rareIds: RARE_IDS });
    if (v.verdict === 'FAIL') console.log(`  ✓ --${name} RED: ${v.reasons[0]}`);
    else {
      console.log(`  ✗ --${name} stayed ${v.verdict} — the comparator is blind to it`);
      for (const r of v.reasons) console.log(`      - ${r}`);
      blind++;
    }
  }
  /* PB-2's own tooth: the carrier forgets max_hp. Read by the PB-2 pin, not
     the bar (the bar is calibrated on the armed model, which never had it). */
  {
    /* At full REPLICAS. MEASURED (2026-10-07): on these normalised fixtures
       the defect is −1.15 % ± 0.38 %, past the ±1 % pin by only 0.4 se, so
       the unpaired pin's margin is PRINTED, not barred — barring it at 2 se
       (Security's first ask) is red on the correct defect and would need
       ~300 replicas. The margin-bearing tooth is PB-2p below (paired seeds). */
    const r = await pb2('manual', ['dropMaxHp'], REPLICAS);
    const margin = Math.abs(r.rel) - 1;
    if (!r.ok) console.log(`  ✓ --dropMaxHp RED on PB-2: ${r.v.verdict} at ${r.rel.toFixed(2)}% ± ${r.se.toFixed(2)}% ticks (past ±1 % by ${(margin / r.se).toFixed(1)} se — thin; PB-2p carries the margin)`);
    else { console.log(`  ✗ --dropMaxHp stayed green on PB-2 (${r.rel.toFixed(2)}% ± ${r.se.toFixed(2)}%) — the pin is blind to the defect it pins`); blind++; }
    const d = await pairedDelta(['dropMaxHp']);
    if (Math.abs(d.mean) > 3 * d.se) console.log(`  ✓ --dropMaxHp RED on PB-2p: ${d.mean.toFixed(3)}% ± ${d.se.toFixed(3)}% (${(Math.abs(d.mean) / d.se).toFixed(1)} se)`);
    else { console.log(`  ✗ --dropMaxHp on PB-2p reads ${d.mean.toFixed(3)}% ± ${d.se.toFixed(3)}% — inside 3 se`); blind++; }
  }
  if (blind || problems) {
    console.error(`\nworld-tick-probe-bar --mutate: ${blind} blind mutant(s), ${problems} red arm(s)`);
    process.exit(1);
  }
  console.log('\nworld-tick-probe-bar --mutate: every mutant RED, as required.');
  process.exit(0);
}

if (problems) {
  console.error(`\nworld-tick-probe-bar: ${problems} red arm(s)`);
  process.exit(1);
}
console.log('\nworld-tick-probe-bar: green — calibration PASS, the shipped shadow composition PASS (max_hp carried).'
  + '\n   mutation proof: node tests/world-tick-probe-bar.mjs --mutate');
