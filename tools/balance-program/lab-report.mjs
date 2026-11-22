// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/lab-report.mjs — WHAT EVERY BALANCE LAB REPORT CARRIES (Balance Lab phase 2; docs/design/redesign/07-balance-lab.md
// section 3.4: "Findings with stable ids", "An assumptions block on every report", "An interval on every number").
//
//   findingId(check, scope)          -> 'LF-xxxxxxxx': the check and its scope key, hashed. Never a line number, a value or a date, so the
//                                       same problem in the same place is the same id on every run and every tree
//   finding(check, scope, what)      -> { id, check, scope, what }
//   diffFindings(pin, now)           -> { new, gone, unchanged } by id: what a report says against the pinned report
//   readPin(file) / pinOf(findings)  -> a pin file (hearthrise.lab-findings/1): the findings a report is compared against
//   assumptionsOf(o)                 -> the assumptions block: the candidate, the scenario and its hash, seeds and hours, the death rule, the
//                                       bar and supply policies, the gear states, what is not modelled and the harness's known distance from
//                                       real play (each with its source). A report without one is refused by the Lab's own checks
//   printAssumptions(block)          -> its lines, for a printed report
//   interval(xs) / rate(k, hours, per)  the two intervals every reader prints: the mean of per-seed values with Student's t at 95%, and an
//                                       exact Poisson rate
//
// PURE ESM. node:crypto for the hash only. Plays nothing, reads no tree.
// ════════════════════════════════════════════════════════════════════════
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { rateCI } from '../balance-sim/stats.mjs';

export const FINDINGS_SCHEMA = 'hearthrise.lab-findings/1';
export const ASSUMPTIONS_SCHEMA = 'hearthrise.lab-assumptions/1';

/** A finding's stable id: its check and its scope, nothing else. */
export const findingId = (check, scope) => 'LF-' + createHash('sha256').update(String(check) + '|' + String(scope)).digest('hex').slice(0, 8);
export const finding = (check, scope, what) => ({ id: findingId(check, scope), check, scope, what });

/** What a report says against its pin: every finding is new, gone or unchanged, by id. Each list is sorted by id. */
export function diffFindings(pin, now) {
  const a = new Map((pin || []).map((f) => [f.id, f])), b = new Map((now || []).map((f) => [f.id, f]));
  const by = (x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  return {
    new: [...b.values()].filter((f) => !a.has(f.id)).sort(by),
    gone: [...a.values()].filter((f) => !b.has(f.id)).sort(by),
    unchanged: [...b.values()].filter((f) => a.has(f.id)).sort(by),
  };
}

/** A pin of a report's findings (ids sorted, so the file only moves when a finding does). */
export const pinOf = (findings, source = null) => ({ schema: FINDINGS_SCHEMA, source, findings: [...findings].sort((x, y) => (x.id < y.id ? -1 : 1)) });
export function readPin(file) {
  if (!file || !existsSync(file)) throw new Error('lab-report: no pin file ' + file);
  const d = JSON.parse(readFileSync(file, 'utf8'));
  if (d.schema !== FINDINGS_SCHEMA || !Array.isArray(d.findings)) throw new Error('lab-report: ' + file + ' is not a findings pin (' + FINDINGS_SCHEMA + ')');
  return d;
}

/* THE HARNESS'S KNOWN DISTANCES FROM REAL PLAY (07-balance-lab.md section 3.4, citing 51-baseline.md): printed on every report until a
   calibration run replaces them. Each says where it was measured. */
export const KNOWN_DISTANCES = Object.freeze([
  Object.freeze({ what: 'Level XP on Krell\'s Hold reads 5.5% under real play', source: 'docs/design/redesign/07-balance-lab.md 3.4 (51-baseline.md)' }),
  Object.freeze({ what: 'the party store bill reads 1.7 to 2.2 times real (1.14 after the shopping fix of lane/c-balance-matrix)', source: '07-balance-lab.md 3.4; systems-engineer log 2026-11-21' }),
  Object.freeze({ what: 'zero deaths on Normal in 1,120 pooled harness hours where real new heroes died 7 times in 78', source: '07-balance-lab.md 3.4 (51-baseline.md)' }),
]);
/* WHAT NO REPORT MODELS YET (07-balance-lab.md sections 3.3 and 6): said on every report so a reading is never taken for more than it is */
export const NOT_MODELLED = Object.freeze([
  'other players: market prices, trades, how real players build',
  'the town day: crafting, farming, the castle and the clan (phase 6, the economy loop)',
  'mechanics the engine cannot play yet: the Danger scale\'s climb and fall back, pulls on readiness, wind-ups, back-row targeting, heroes against heroes',
  'rolled gear, Traits, spell evolutions and the luck flame (phase 4)',
  'a drink\'s mana over time and natural mana regeneration (no event carries them: the mana counters read casts, shots and waits)',
]);

/**
 * THE ASSUMPTIONS BLOCK. `o`: { candidate (id or patch name, null for the tree), tree ({ commit, dirty }), scenario ({ run, blocks, seeds,
 * hours, cells, planHash }), deathRule, bar, supply, gear, notModelled (extra lines), distances (extra rows) }. Every field is required to be
 * stated: a missing one prints as UNSTATED and fails checkAssumptions.
 */
export function assumptionsOf(o = {}) {
  const s = o.scenario || {};
  return {
    schema: ASSUMPTIONS_SCHEMA,
    candidate: o.candidate === undefined ? 'UNSTATED' : o.candidate || 'C0 (the tree as it stands)',
    tree: o.tree || 'UNSTATED',
    scenario: { run: s.run || 'UNSTATED', blocks: s.blocks || 'UNSTATED', cells: Number.isInteger(s.cells) ? s.cells : 'UNSTATED', planHash: s.planHash || 'UNSTATED' },
    seeds: Number.isInteger(s.seeds) ? s.seeds : 'UNSTATED', hours: Number.isFinite(s.hours) ? s.hours : 'UNSTATED',
    deathRule: o.deathRule || 'UNSTATED', bar: o.bar || 'UNSTATED', supply: o.supply || 'UNSTATED', gear: o.gear || 'UNSTATED',
    notModelled: [...NOT_MODELLED, ...(o.notModelled || [])],
    distances: [...KNOWN_DISTANCES, ...(o.distances || [])],
  };
}
/** Every field an assumptions block must state; answers the unstated ones (empty = complete). */
export function checkAssumptions(a) {
  if (!a || a.schema !== ASSUMPTIONS_SCHEMA) return ['no assumptions block'];
  const out = [];
  const walk = (v, p) => { if (v === 'UNSTATED') out.push(p); else if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) walk(x, p + '.' + k); };
  walk(a, 'assumptions');
  if (!a.notModelled.length) out.push('assumptions.notModelled is empty');
  if (!a.distances.length) out.push('assumptions.distances is empty');
  return out;
}
export function printAssumptions(a) {
  const t = a.tree && typeof a.tree === 'object' ? a.tree.commit + (a.tree.dirty ? ' (with uncommitted changes)' : '') : a.tree;
  return [
    'ASSUMPTIONS',
    '  candidate   ' + a.candidate + ' on ' + t,
    '  scenario    ' + a.scenario.run + ' run, blocks ' + [].concat(a.scenario.blocks).join(', ') + ', ' + a.scenario.cells + ' cells, plan ' + a.scenario.planHash + ', ' + a.seeds + ' seed(s) of ' + a.hours + ' h',
    '  rules       death: ' + a.deathRule + '. bar: ' + a.bar + '. supply: ' + a.supply + '. gear: ' + a.gear,
    '  not modelled',
    ...a.notModelled.map((x) => '    - ' + x),
    '  the harness against real play',
    ...a.distances.map((d) => '    - ' + d.what + ' (' + d.source + ')'),
  ];
}

/* ── THE INTERVALS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const T975 = [null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228];
const tCrit = (df) => (df < 1 ? Infinity : df < T975.length ? T975[df] : df < 30 ? 2.09 : 1.96);
const sig = (x) => (Number.isFinite(x) ? Number(x.toPrecision(4)) : null);
/** The mean of per-seed values with its 95% interval (Student's t): { value, lo, hi, n }. Fewer than two values: no interval. */
export function interval(xs) {
  const v = (xs || []).filter((x) => Number.isFinite(x));
  if (!v.length) return { value: null, lo: null, hi: null, n: 0 };
  const m = v.reduce((a, x) => a + x, 0) / v.length;
  if (v.length < 2) return { value: sig(m), lo: null, hi: null, n: 1 };
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)), w = (tCrit(v.length - 1) * sd) / Math.sqrt(v.length);
  return { value: sig(m), lo: sig(m - w), hi: sig(m + w), n: v.length };
}
/** A count over hours as a rate per `per` hours, with its exact 95% Poisson interval: { value, lo, hi, n (the count) }. */
export function rate(k, hours, per) {
  const r = rateCI(k, hours, per);
  return { value: r.rate, lo: r.lo, hi: r.hi, n: k };
}
