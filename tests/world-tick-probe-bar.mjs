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
// No network, no database, no credential.
// ============================================================================

import { loadCombatSessions, atSpan, settleCombatSession, combatTick,
  offlineSeedFor, seedLabelFor, pgTimestamptzText } from '../services/world-tick/combat.js';
import { loadGatherSessions, atSpan as gatherAtSpan, settleGatherSession }
  from '../services/world-tick/gather.js';
import { hydrate, advance, seedFor } from '../supabase/functions/hr-accrue/tick-shadow.js';
import { shadowStateOf, applyShadowState } from '../supabase/functions/hr-accrue/tick-contract.js';
import { oneSpan, probeResultOf, PROBE_SPAN_MS, encodeProbeInput, decodeProbeInput }
  from '../supabase/functions/hr-accrue/tick-probe.js';
import { judgeGroup } from '../services/world-tick/parity-bar.js';
import { hashSeed } from '../src/core/rng.js';
import { levelFromXp } from '../src/core/xp.js';
import { MONSTERS } from '../src/data/monsters.js';

const ARGS = process.argv.slice(2);
const MUTATE = ARGS.includes('--mutate');
const VERBOSE = ARGS.includes('--verbose');
const say = (s) => { if (VERBOSE) console.log(s); };

const FROM = Date.UTC(2026, 2, 14, 20, 0, 0);
const START_STEP_MS = 7 * 3600 * 1000;
const STARTS = 3;
const CADENCE_MS = 10000;      // production's cadence_seconds
const FLUSH_MS = 90000;        // production's flush_seconds
const MAX_POLLS = 64;          // tick.js MAX_POLLS
const RARE_IDS = new Set(Object.values(MONSTERS)
  .flatMap((m) => (m.drops || []).filter((d) => d.lucky).map((d) => d.id)));

let problems = 0;
const judge = (id, ok, good, bad) => {
  if (ok) console.log(`  ✓ ${id} — ${good}`);
  else { console.log(`  ✗ ${id} — ${bad}`); problems++; }
};

/* ── THE FIXTURE SET ─────────────────────────────────────────────────────────
   The C6 combat sessions, minus the two a probe can never close on (the
   pointer ENDS inside the span — `seven falls deep` and `three falls, pulls
   back` stop at 2.1 h and 3 min, so the roster drops the character and the
   open probe is superseded, never read) and the ATTENDED one (the tick refuses
   it by design, WORLD_TICK_DESIGN.md 16.6).
   NORMALISED to the production invariant max_hp = hitpoints level
   (2026-09-06-max-hp-tracks-hitpoints.sql). The raw fixtures carry max_hp 60
   on hitpoints level 36; a one-span accrual drops that to 37 at the first
   hitpoints level-up while a chain keeps 60, which is a fixture artefact and
   not a property of either path. */
function combatFixtures() {
  const out = [];
  for (const raw of loadCombatSessions()) {
    if (/ATTENDED/.test(raw.name)) continue;
    const s = JSON.parse(JSON.stringify(raw));
    const lvl = Math.max(10, levelFromXp(Number((s.skills || {}).hitpoints) || 0));
    s.hp = Math.max(1, Math.round((Number(s.hp) || 0) / (Number(s.maxHp) || lvl) * lvl));
    s.maxHp = lvl;
    s.version = 1;
    out.push(s);
  }
  return out;
}

const sumInto = (acc, res) => {
  if (!res || !res.accrued) return acc;
  const p = probeResultOf(res);
  for (const k of ['ticks', 'qty', 'gold', 'kills', 'ate', 'deaths']) acc[k] += p[k];
  for (const k of Object.keys(p.xp)) acc.xp[k] = (acc.xp[k] || 0) + p.xp[k];
  for (const k of Object.keys(p.items)) acc.items[k] = (acc.items[k] || 0) + p.items[k];
  /* "recovering_until parseable on every death-bearing row": NULL is the
     engine's own "already up" (a first-death grace, or a recovery that ended
     inside the window); anything else must parse as an instant. */
  if (p.deaths > 0 && p.recovering_until !== null && !Number.isFinite(Date.parse(p.recovering_until))) {
    acc.recoverOk = false;
  }
  return acc;
};
const zero = () => ({ ticks: 0, qty: 0, gold: 0, kills: 0, ate: 0, deaths: 0, xp: {}, items: {}, recoverOk: true });

/* ── THE SHIPPED SHADOW COMPOSITION ─────────────────────────────────────────
   Exactly what production does across fires: each fire builds the session
   from the FROZEN row (c0), lays the previous fire's carrier over it, and
   settles ONE flush window through the shipped settler. No hook. */
function shippedShadow(c0, from, to) {
  const acc = zero();
  let carrier = null;
  let mark = from;
  let markText = c0.accruedToText;
  while (mark < to) {
    const base = JSON.parse(JSON.stringify(c0));
    base.accruedToMs = mark;
    base.accruedToText = markText;
    const sess = carrier ? applyShadowState(base, carrier) : base;
    const run = settleCombatSession(sess, mark, Math.min(to, mark + FLUSH_MS),
      { cadenceMs: CADENCE_MS, flushMs: FLUSH_MS, maxPolls: MAX_POLLS });
    for (const r of run.results) sumInto(acc, r.res);
    if (run.settled === 0) break;
    carrier = shadowStateOf(run.char, { baseVersion: c0.version, atMs: run.watermarkMs });
    mark = run.watermarkMs;
    markText = pgTimestamptzText(mark);
    if (run.stoppedBy === 'activity') break;
  }
  return { acc, endMs: mark };
}

/* ── THE SAME COMPOSITION, HAND-DRIVEN, WITH THE MUTATION SEAMS ──────────────
   A mutation that had to be supported by the code under test is not a
   mutation, so the seams live HERE (the tickChainManual pattern of
   tests/world-tick-combat-parity.mjs). Fire by fire exactly as production
   runs: the session rebuilt from the frozen row + the REAL carrier
   (shadowStateOf → applyShadowState), a 10 s poll grid restarted at the mark,
   at most MAX_POLLS polls. PB-0 asserts that with no mutation and no
   derivation this loop and `shippedShadow` agree exactly.
   `armedMaxHp` models the ARMED chain: each fire's row carries max_hp = the
   hitpoints level of the XP settled so far, which is what
   2026-09-06-max-hp-tracks-hitpoints.sql's trigger hands the next fire. */
function manualChain(c0, from, to, m) {
  const mut = m || {};
  const acc = zero();
  let carrier = null;
  let mark = from;
  let markText = c0.accruedToText;
  let stopped = false;
  let resumeLine = null;
  while (mark < to && !stopped) {
    const base = JSON.parse(JSON.stringify(c0));
    base.accruedToMs = mark;
    base.accruedToText = markText;
    const sess = carrier ? applyShadowState(base, carrier) : base;
    if (mut.armedMaxHp) {
      sess.maxHp = Math.max(Number(sess.maxHp) || 0,
        levelFromXp(Number((sess.skills || {}).hitpoints) || 0));
    }
    const char = hydrate(sess);
    const fireEnd = Math.min(to, mark + FLUSH_MS);
    let wm = mark;
    let wmText = markText;
    let clock = mark;
    let polls = 0;
    let settled = 0;
    while (clock < fireEnd && polls < MAX_POLLS) {
      clock = Math.min(clock + CADENCE_MS, fireEnd);
      polls++;
      /* RESUME MISALIGNMENT: the first window past the recovery line starts
         `resumeMisalignMs` AFTER it, so that stretch of a standing,
         fighting character is never simulated — a one-signed loss per fall. */
      if (resumeLine !== null && clock > resumeLine) {
        wm = Math.max(wm, resumeLine + mut.resumeMisalignMs);
        wmText = pgTimestamptzText(wm);
        resumeLine = null;
      }
      const start = wm + (mut.shiftMs || 0);
      if (start >= clock) continue;
      const label = mut.fixedLabel ? seedLabelFor(c0.accruedToText) : seedLabelFor(wmText);
      const res = combatTick(char, start, wmText, clock, {
        seedOf: () => hashSeed(String(char.userId), String(char.slot), label),
        perturb: mut.perturb,
      });
      if (res.accrued && mut.delta) res.delta = mut.delta(res.delta);
      sumInto(acc, res);
      if (res.accrued) {
        settled++;
        advance(char, res);
        if (mut.afterWindow) mut.afterWindow(char, res);
        wm = Date.parse(res.delta.accrued_to);
        if (mut.resumeMisalignMs && res.summary && res.summary.deaths > 0) {
          resumeLine = Math.max(wm, Number(char.recoveringUntilMs) || 0);
        }
        wmText = pgTimestamptzText(wm);
        if (res.delta.activity) { stopped = true; break; }
      }
    }
    if (settled === 0 && wm === mark) break;
    if (settled > 0) carrier = shadowStateOf(char, { baseVersion: c0.version, atMs: wm });
    mark = wm;
    markText = wmText;
  }
  return { acc, endMs: mark };
}

/* ONE PROBE: the one-span accrual over [from, chainEnd] from the SAME session
   snapshot (round-tripped through the stored form) on the span start's seed. */
function probeOf(c0, from, endMs) {
  const snap = decodeProbeInput(encodeProbeInput(c0));
  const res = oneSpan('combat', snap, from, endMs, offlineSeedFor(c0.userId, c0.slot, c0.accruedToText));
  return sumInto(zero(), res);
}

function buildRead(chainFn, mut) {
  const probes = [];
  let n = 0;
  for (const fx of combatFixtures()) {
    for (let i = 0; i < STARTS; i++) {
      const from = FROM + i * START_STEP_MS;
      const c0 = atSpan(fx, from);
      const to = from + PROBE_SPAN_MS;
      const { acc, endMs } = chainFn(c0, from, to, mut);
      /* A pointer that ENDS inside the span never closes a probe in
         production (the roster drops the character), so it is not one here. */
      if (endMs - from < PROBE_SPAN_MS - FLUSH_MS) continue;
      const one = probeOf(c0, from, endMs);
      probes.push({ id: `${++n}:${fx.name.slice(0, 18)}@${i}`, spanMs: endMs - from, discard: null, one, chain: acc });
    }
  }
  return probes;
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

// ── PB-1 CALIBRATION: the armed-equivalent decomposition is GREEN ──────────
const CAL = { armedMaxHp: true };
const calProbes = buildRead(manualChain, CAL);
show(calProbes);
const cal = judgeGroup('combat', calProbes, { rareIds: RARE_IDS });
judge('PB-1', cal.verdict === 'PASS',
  `combat bar PASS on ${cal.stats.probes} probes / ${cal.stats.hours} h `
  + `(ticks ${JSON.stringify(cal.stats.ticks)}, direction ${JSON.stringify(cal.stats.direction)})`,
  `combat bar ${cal.verdict} on the calibration set:\n      - ${cal.reasons.join('\n      - ')}`);

// ── PB-1g CALIBRATION: gather, six 4 h probes ─────────────────────────────
{
  const probes = [];
  let n = 0;
  for (const raw of loadGatherSessions()) {
    for (let i = 0; i < STARTS; i++) {
      const from = FROM + i * START_STEP_MS;
      const c0 = gatherAtSpan(raw, from);
      const run = settleGatherSession(c0, from, from + PROBE_SPAN_MS, { cadenceMs: CADENCE_MS, flushMs: FLUSH_MS });
      const chain = zero();
      for (const r of run.results) sumInto(chain, r.res);
      const snap = decodeProbeInput(encodeProbeInput(c0));
      const one = sumInto(zero(), oneSpan('gather', snap, from, run.watermarkMs, seedFor(c0.userId, c0.slot, from)));
      probes.push({ id: `g${++n}`, spanMs: run.watermarkMs - from, discard: null, one, chain });
    }
  }
  const g = judgeGroup('gather', probes, {});
  judge('PB-1g', g.verdict === 'PASS',
    `gather bar PASS on ${g.stats.probes} probes / ${g.stats.hours} h (qty ${JSON.stringify(g.stats.qty)})`,
    `gather bar ${g.verdict}:\n      - ${g.reasons.join('\n      - ')}`);
}

// ── PB-2 THE PINNED FINDING: the shipped SHADOW composition carries maxHp ──
{
  const probes = buildRead((c0, from, to) => shippedShadow(c0, from, to));
  const v = judgeGroup('combat', probes, { rareIds: RARE_IDS });
  const t = v.stats.ticks || { one: 0, chain: 0 };
  const loss = t.one ? ((t.chain - t.one) / t.one) * 100 : NaN;
  judge('PB-2 (pinned)', v.verdict === 'PASS' && Math.abs(loss) <= 1,
    `the shipped shadow composition reads ${loss.toFixed(1)}% ticks on death-bearing probes and the bar `
    + 'is GREEN — the carrier carries max_hp (lane/world-tick-maxhp-carry closed the −13.6 % it pinned).',
    `the pin MOVED: the shipped shadow composition now reads ${v.verdict} at ${loss.toFixed(1)}% ticks `
    + '(required: PASS inside ±1 %). The carrier has lost something the armed chain keeps — find it.\n      - '
    + (v.reasons || []).join('\n      - '));
}

// ── THE MUTANTS ────────────────────────────────────────────────────────────
const MUTANTS = {
  /* One constant instant seeds every window (the §11 shape). */
  fixedSeed: { fixedLabel: true },
  /* Every window starts one 2.4 s combat tick after the watermark: a
     one-signed time loss. (A 1 s shift — the M3 guard's spelling — is
     ABSORBED here: RULE-1 alignment snaps it back onto the tick grid and no
     time is lost, so at probe grain it is not a defect and stays green.) */
  shiftWindow: { shiftMs: 2400 },
  /* The tick forgets the auto-eat inputs (M3's own P0). */
  noAutoEat: { perturb: (inp) => { const o = { ...inp }; delete o.autoEatEnabled; delete o.autoEatFood; delete o.autoEatPct; return o; } },
  /* A death at a window boundary is a full heal (b509). */
  freeHeal: { afterWindow: (char, res) => { if (res.summary && res.summary.deaths > 0) char.hp = char.maxHp; } },
  /* The meals happen; the debit never reaches the bag. */
  skipFoodDebit: { delta: (d) => {
    if (!d.items) return d;
    const items = {};
    for (const k of Object.keys(d.items)) if (d.items[k] > 0) items[k] = d.items[k];
    const out = { ...d };
    if (Object.keys(items).length) out.items = items; else delete out.items;
    return out;
  } },
  /* COMBAT-PARITY-RC's hypothesis, at the magnitude it would need to explain
     the production interval: −14.5 % of a 10 h interval over 9 falls is
     ~10 min lost per resume. The first window past each recovery line starts
     10 min after it. MEASURED DETECTION FLOOR (2026-10-05): a per-resume loss
     of 4 min stays GREEN on this 15-probe set and 10 min is RED — the bar
     cannot see a resume defect much smaller than the one it was written to
     find, and a reader of a green production read should know that. */
  resumeMisalign: { resumeMisalignMs: 600000 },
};

if (MUTATE) {
  console.log('\n  mutants (each must turn the calibrated PASS into FAIL)');
  let blind = 0;
  for (const [name, m] of Object.entries(MUTANTS)) {
    const probes = buildRead(manualChain, Object.assign({}, CAL, m));
    const v = judgeGroup('combat', probes, { rareIds: RARE_IDS });
    if (v.verdict === 'FAIL') console.log(`  ✓ --${name} RED: ${v.reasons[0]}`);
    else { console.log(`  ✗ --${name} stayed ${v.verdict} — the comparator is blind to it`); blind++; }
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
