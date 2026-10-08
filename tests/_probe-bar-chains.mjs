// ============================================================================
// tests/_probe-bar-chains.mjs — THE CHAINS tests/world-tick-probe-bar.mjs READS,
// AS PURE FUNCTIONS OF A PLAIN-DATA SPEC.
//
// Moved out of the guard (2026-10-08, db-replay-5 cancelled at 20 min, run
// 37725703255) so the guard's ~2 500 chain/one-span runs can be spread over
// worker threads (tools/world-tick-replay-pool.mjs) and computed ONCE each:
// PB-1, PB-2 and PB-2p replay the same (fixture, start, span, seed family)
// chains, and every mutant re-ran the same one-span replicas. `task(spec)` is
// deterministic in its spec, so a result computed in a worker, or remembered
// from an earlier section, is the result the serial loop computes. The code
// below is the guard's own, moved verbatim; the mutation seams stay HERE, in
// test code, never in the code under test.
//
// No network, no database, no credential.
// ============================================================================

import { loadCombatSessions, atSpan, combatTick,
  offlineSeedFor, seedLabelFor, pgTimestamptzText } from '../services/world-tick/combat.js';
import { hydrate, advance } from '../supabase/functions/hr-accrue/tick-shadow.js';
import { shadowStateOf, applyShadowState } from '../supabase/functions/hr-accrue/tick-contract.js';
import { oneSpan, probeResultOf, encodeProbeInput, decodeProbeInput }
  from '../supabase/functions/hr-accrue/tick-probe.js';
import { shippedChain, replicaSeedOf } from '../services/world-tick/parity-replay.js';
import { hashSeed } from '../src/core/rng.js';
import { levelFromXp } from '../src/core/xp.js';

export const FROM = Date.UTC(2026, 2, 14, 20, 0, 0);
export const START_STEP_MS = 7 * 3600 * 1000;
export const STARTS = 3;
export const CADENCE_MS = 10000;      // production's cadence_seconds
export const FLUSH_MS = 90000;        // production's flush_seconds
const MAX_POLLS = 64;                 // tick.js MAX_POLLS

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
export function combatFixtures() {
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

export const sumInto = (acc, res) => {
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
export const zero = () => ({ ticks: 0, qty: 0, gold: 0, kills: 0, ate: 0, deaths: 0, xp: {}, items: {}, recoverOk: true });

/* ── THE SHIPPED SHADOW COMPOSITION ─────────────────────────────────────────
   Exactly what production does across fires: each fire builds the session
   from the FROZEN row (c0), lays the previous fire's carrier over it, and
   settles ONE flush window through the shipped settler. No hook. The loop is
   services/world-tick/parity-replay.js `shippedChain` — the one the
   evaluator replays production probes with. `m.salt` picks a replica's seed
   family (parity-replay.js replicaSeedOf); unset, the probe's own stream. */
export function shippedShadow(c0, from, to, m) {
  const acc = zero();
  const salt = m && m.salt;
  const { windows, endMs } = shippedChain(c0, from, to,
    salt == null ? {} : { seedOf: replicaSeedOf(c0.userId, c0.slot, salt) });
  for (const res of windows) sumInto(acc, res);
  return { acc, endMs };
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
export function manualChain(c0, from, to, m) {
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
    /* THE PB-2 DEFECT, RE-OPENED: the carrier forgets max_hp (every fire
       rebuilds it from the frozen row) — PB-2's own mutant. */
    if (mut.dropMaxHp) sess.maxHp = c0.maxHp;
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
      const label0 = mut.fixedLabel ? seedLabelFor(c0.accruedToText) : seedLabelFor(wmText);
      /* A replica's seed family, spelled as parity-replay.js replicaSeedOf. */
      const label = mut.salt == null ? label0 : `replay#${mut.salt}|${label0}`;
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
export function probeOf(c0, from, endMs, salt) {
  const snap = decodeProbeInput(encodeProbeInput(c0));
  const seed = salt == null ? offlineSeedFor(c0.userId, c0.slot, c0.accruedToText)
    : replicaSeedOf(c0.userId, c0.slot, salt)(from, c0.accruedToText);
  const res = oneSpan('combat', snap, from, endMs, seed);
  return sumInto(zero(), res);
}

// ── THE MUTANTS ────────────────────────────────────────────────────────────
export const MUTANTS = {
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

/* A mutation by NAME, so a spec is plain data a worker can receive: `cal` is
   the armed-equivalent model (PB-1's calibration, PB-2p's armed side). */
const NAMED = Object.assign({ cal: { armedMaxHp: true }, dropMaxHp: { dropMaxHp: true } }, MUTANTS);
export function mutOf(names, salt) {
  const m = {};
  for (const n of names || []) {
    if (!NAMED[n]) throw new Error(`_probe-bar-chains: no mutation named ${n}`);
    Object.assign(m, NAMED[n]);
  }
  if (salt != null) m.salt = salt;
  return m;
}

/* ── THE TASK ────────────────────────────────────────────────────────────────
   spec = { kind: 'chain' | 'one', chain: 'shipped' | 'manual', muts: [name],
            fx: fixture index, from, to, salt }
   chain → { acc, endMs }; one → acc. c0 is rebuilt from the fixture file. */
let FIXTURES = null;
export function task(spec) {
  if (!FIXTURES) FIXTURES = combatFixtures();
  const c0 = atSpan(FIXTURES[spec.fx], spec.from);
  if (spec.kind === 'one') return probeOf(c0, spec.from, spec.to, spec.salt == null ? undefined : spec.salt);
  if (spec.chain === 'shipped') return shippedShadow(c0, spec.from, spec.to, spec.salt == null ? undefined : { salt: spec.salt });
  return manualChain(c0, spec.from, spec.to, mutOf(spec.muts, spec.salt));
}
