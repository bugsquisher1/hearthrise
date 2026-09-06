#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/apply-order-honesty.mjs — THE DEPLOYMENT RECORD MUST NOT LIE.
//
//   node tests/apply-order-honesty.mjs             the guard (credential-free, CI)
//   node tests/apply-order-honesty.mjs --list      what it derived, and from what
//   node tests/apply-order-honesty.mjs --selftest  plant both defects, require each caught
//
// ── THE FAILURE THIS EXISTS TO KILL ─────────────────────────────────────────
// 2026-09-06: tests/schema-apply-order.json's `_order_notes` said "STAGED, NOT
// APPLIED" for FOURTEEN migrations that were measurably LIVE on production —
// among them 2026-09-08-hero-slot-buy.sql, 2026-09-09-import-apply-slot-
// entitlement.sql and 2026-09-12-bounty-accept-bh-clamp.sql, whose own note
// PREDICTED the post-apply replay hash that tests/live-hash-drift.baseline.json
// had by then measured as the LIVE one. The apply-order file is the disaster-
// recovery contract: it is what an operator reads to decide what still has to be
// run. An operator acting on it would have re-applied all fourteen believing
// they were new. Every one of them happens to be anchor-guarded and idempotent,
// so tonight they would have failed closed — the next one might not, and
// "we got away with it" is not a control.
//
// The two records already existed and already disagreed. Nothing compared them.
// This does, in the only place it is cheap: two JSON files, no database, no
// credential, no replay — so it can run on every push next to the guards whose
// measurements it consumes.
//
// ── WHAT COUNTS AS EVIDENCE (and why it is not a guess) ─────────────────────
// live-hash-drift.baseline.json records, per tracked function BODY, the md5 that
// was MEASURED on production and the md5 the repo chain REBUILDS, plus the list
// of migrations that touch that body (`touched_by`). Map that to a per-FILE
// verdict with one rule:
//
//   A file is EVIDENCED-LIVE when it is the LAST file in the apply order that
//   touches some tracked body, and production carries the body the chain —
//   including that file — builds.
//
// "Last" is load-bearing and is the reason this is not the loose check it looks
// like. Two files in a row may restate the same body: the later one's text
// already contains the earlier one's change, so production matching the chain
// says nothing about whether the EARLIER file ever ran. Only the last toucher's
// own text is proven installed. Everything else is left alone, and the guard
// stays silent rather than accusing.
//
// "Production carries it" is true in two shapes, both taken from the baseline
// itself, never re-derived here:
//   hash      live.md5 === replay.md5 — identical normalised bodies.
//   codediff  the hashes differ and the entry's `why` records a VERIFIED
//             --codediff result of CODE-IDENTICAL, i.e. the whole delta is
//             comments/whitespace and production runs the same executable text.
//             (The baseline's hash is deliberately comment-sensitive; a file
//             that grew a comment after it was applied is still applied.)
//
// ── RED IN BOTH DIRECTIONS ──────────────────────────────────────────────────
//   stale-staged   a note claims STAGED / NOT APPLIED for an EVIDENCED-LIVE
//                  file. The named failure.
//   false-applied  a note claims APPLIED for a file whose only tracked bodies
//                  the baseline records as ABSENT on production (live: null).
//                  A record that overstates is as dangerous as one that
//                  understates — it is how a migration never gets run.
//   orphan-file    the baseline names a migration in touched_by that the apply
//                  order does not account for at all. The two records have
//                  structurally drifted and neither is trustworthy.
//
// A note with NO claim token is NOT a finding: silence is a documentation gap,
// not a false statement, and making it fail would push authors toward vaguer
// prose rather than truer prose. `--list` counts them so the gap is visible.
//
// ── LIMITS, STATED ──────────────────────────────────────────────────────────
// A migration that authors no function body (a catalogue reseed, a grant sweep,
// an index) has no baseline entry, so this guard has NOTHING to say about it and
// says nothing. 2026-09-03-start-kit-food-bridge.sql is exactly that case: it
// was found live on 2026-09-06 by reading hr_start_inventory, and its note now
// records that read as the evidence, because no automated check can.
//
// Exit: 0 green · 1 a dishonest note · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const ORDER_FILE = join(ROOT, 'tests', 'schema-apply-order.json');
const BASELINE_FILE = join(ROOT, 'tests', 'live-hash-drift.baseline.json');

const argv = process.argv.slice(2);
const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

// ── THE CLAIM A NOTE MAKES ─────────────────────────────────────────────────
// Notes are prose, so read the note's LEADING claim: whichever of the two claim
// tokens appears first. That is deliberate — "APPLIED 2026-08-22 live via
// execute_sql (… the replay applies it too …)" leads with APPLIED and is honest,
// while a note that opens "STAGED, NOT APPLIED" and mentions an apply four
// sentences later is the thing that misled the operator in the first place.
const STAGED_TOKEN = /\bSTAGED\b|\bNOT\s+APPLIED\b/i;
const APPLIED_TOKEN = /\bAPPLIED\b/i;

export function claimOf(note) {
  const s = String(note || '');
  const st = s.search(STAGED_TOKEN);
  // the first APPLIED that is not the tail of a NOT APPLIED
  let ap = -1;
  for (const m of s.matchAll(/\bAPPLIED\b/gi)) {
    if (/\bNOT\s+$/i.test(s.slice(Math.max(0, m.index - 8), m.index))) continue;
    ap = m.index; break;
  }
  if (st < 0 && ap < 0) return { kind: 'none', at: -1 };
  if (ap < 0 || (st >= 0 && st < ap)) return { kind: 'staged', at: st };
  return { kind: 'applied', at: ap };
}

// ── THE PER-FILE VERDICT, DERIVED FROM THE BASELINE ────────────────────────
/**
 * @param {object} order the parsed schema-apply-order.json
 * @param {object} base  the parsed live-hash-drift.baseline.json
 * @returns {{evidence:Map<string,{how:string,fn:string}[]>, absent:Map<string,string[]>,
 *            orphans:string[], replayed:Set<string>}}
 */
export function derive(order, base) {
  const replayed = [...(order.pre_schema || []), ...(order.order || [])];
  const idx = new Map(replayed.map((f, i) => [f, i]));
  const excluded = new Set(Array.isArray(order.excluded)
    ? order.excluded : Object.keys(order.excluded || {}));
  const known = new Set([...idx.keys(), ...excluded]);

  const evidence = new Map();   // file -> [{how, fn}]  proven ON production
  const absent = new Map();     // file -> [fn]         proven NOT on production
  const orphans = new Set();

  for (const e of base.functions || []) {
    const touched = e.touched_by || [];
    for (const f of touched) if (!known.has(f)) orphans.add(f);
    const inOrder = touched.filter((f) => idx.has(f));
    if (!inOrder.length) continue;
    const last = inOrder.reduce((a, f) => (idx.get(f) > idx.get(a) ? f : a));
    if (!e.live) { absent.set(last, [...(absent.get(last) || []), e.name]); continue; }
    let how = null;
    if (e.replay && e.live.md5 === e.replay.md5) how = 'hash';
    else if (/\bCODE-IDENTICAL\b/.test(String(e.why || ''))) how = 'codediff';
    if (!how) continue;   // a divergence nobody has explained proves nothing either way
    evidence.set(last, [...(evidence.get(last) || []), { how, fn: e.name }]);
  }
  return { evidence, absent, orphans: [...orphans].sort(), replayed: new Set(replayed) };
}

// ── THE CLASSIFIER — pure, so the selftest needs no files ──────────────────
export function classify(order, base) {
  const findings = [];
  const say = (key, detail) => findings.push({ key, detail });
  const notes = order._order_notes || {};
  const { evidence, absent, orphans } = derive(order, base);

  for (const f of orphans) {
    say(`orphan-file ${f}`,
      'tests/live-hash-drift.baseline.json names this migration in a touched_by list and '
      + 'tests/schema-apply-order.json accounts for it in neither order, pre_schema nor excluded. '
      + 'The two records of what this database is made of have structurally drifted; fix that '
      + 'before trusting either.');
  }

  for (const [file, ev] of evidence) {
    const claim = claimOf(notes[file]);
    if (claim.kind !== 'staged') continue;
    const why = ev.map((x) => `${x.fn} (${x.how})`).join(', ');
    say(`stale-staged ${file}`,
      `the note claims STAGED / NOT APPLIED, and the live-hash baseline proves this file is the `
      + `LAST file in the apply order touching ${why} with production carrying the body the chain `
      + 'builds. It is APPLIED. An operator reading this file to decide what still has to be run '
      + 'would re-apply it. Correct the note to APPLIED with the evidence — do not weaken this '
      + 'guard, and do not re-apply the migration to make the prose true.');
  }

  for (const [file, fns] of absent) {
    if (evidence.has(file)) continue;   // some other body of its does exist live
    const claim = claimOf(notes[file]);
    if (claim.kind !== 'applied') continue;
    say(`false-applied ${file}`,
      `the note claims APPLIED, and the live-hash baseline records ${fns.join(', ')} as ABSENT on `
      + 'production while this file is the last file in the apply order that builds it. A '
      + 'deployment record that overstates is how a migration never gets run at all. Re-measure '
      + '(node tests/live-hash-drift.mjs --live) and make one of the two records true.');
  }

  return { findings, checked: evidence.size + absent.size };
}

// ── ANTI-VACUITY ───────────────────────────────────────────────────────────
// "A bug that was never planted is the same defect as a probe that is always
// null" (schema-drift.mjs). If the derivation finds nothing to grade, this guard
// prints a confident green while checking zero claims — which is precisely the
// state the repository was already in.
function assertNotVacuous(order, base, d) {
  if (!Object.keys(order._order_notes || {}).length) {
    throw harness('schema-apply-order.json has no _order_notes to check');
  }
  if (!(base.functions || []).length) throw harness('the live-hash baseline lists no functions');
  if (!d.evidence.size) {
    throw harness('the derivation produced ZERO evidenced-live files from '
      + `${base.functions.length} baseline entries. Either the baseline lost its touched_by lists `
      + 'or the apply order lost its filenames; either way this guard is grading nothing.');
  }
}

const load = async () => {
  const one = async (p) => {
    try { return JSON.parse(await readFile(p, 'utf8')); }
    catch (e) { throw harness(`cannot read ${p}: ${String(e.message || e).split('\n')[0]}`); }
  };
  return { order: await one(ORDER_FILE), base: await one(BASELINE_FILE) };
};

// ════════════════════════════════════════════════════════════════════════
// THE SELFTEST — both defect kinds planted, each caught by a NAMED assertion
// ════════════════════════════════════════════════════════════════════════
const clone = (o) => JSON.parse(JSON.stringify(o));

async function selftest() {
  const { order, base } = await load();
  const d = derive(order, base);
  assertNotVacuous(order, base, d);

  // THE FALSE-POSITIVE FLOOR. The real pair must grade clean, or every planted
  // defect below "passes" on the noise floor.
  const clean = classify(order, base).findings;
  if (clean.length) {
    throw harness('--selftest: the real files already produce '
      + `${clean.length} finding(s), so every planted defect below would pass for the wrong `
      + `reason. First: ${clean[0].key}`);
  }
  console.log(`  clean floor: 0 findings over ${d.evidence.size} evidenced-live file(s) `
    + `and ${Object.keys(order._order_notes).length} note(s)`);

  const liveFile = [...d.evidence.keys()].sort()[0];
  const CASES = {
    staged_note_for_a_live_migration: {
      what: 'the deployment record calls a migration STAGED that production is measurably '
          + 'running — the 2026-09-06 defect, and the one an operator acts on',
      expect: `stale-staged ${liveFile}`,
      make: () => {
        const o = clone(order);
        o._order_notes[liveFile] = 'STAGED, NOT APPLIED - REVIEW ONLY; the Coordinator applies.';
        return [o, base];
      },
    },
    applied_note_for_an_absent_migration: {
      what: 'the record claims a migration is APPLIED while the baseline measured its body as '
          + 'ABSENT on production. The opposite lie, and the one that means a migration never '
          + 'gets run at all',
      expect: 'false-applied 9999-99-99-planted-absent.sql',
      make: () => {
        const o = clone(order); const b = clone(base);
        o.order = [...o.order, '9999-99-99-planted-absent.sql'];
        o._order_notes['9999-99-99-planted-absent.sql'] = 'APPLIED 2026-09-06 (additive/idempotent).';
        b.functions = [...b.functions, {
          sig: 'hr_selftest_absent_verb(p_slot integer)',
          name: 'hr_selftest_absent_verb',
          tracked_by: ['pin'],
          touched_by: ['9999-99-99-planted-absent.sql'],
          live: null,
          replay: { md5: 'a'.repeat(32), norm_len: 64, source: 'computed-from-replay' },
          agree: false,
          why: 'created by a migration the repo records as STAGED, not applied',
        }];
        return [o, b];
      },
    },
    baseline_names_a_file_the_order_forgot: {
      what: 'the two records drift structurally: the baseline tracks a migration the apply order '
          + 'does not list anywhere, so a rebuild would not include it and no verdict about it '
          + 'means anything',
      expect: 'orphan-file 9999-99-99-planted-orphan.sql',
      make: () => {
        const b = clone(base);
        b.functions[0] = { ...b.functions[0],
          touched_by: [...b.functions[0].touched_by, '9999-99-99-planted-orphan.sql'] };
        return [order, b];
      },
    },
    honest_applied_note_is_not_a_finding: {
      what: 'THE NEGATIVE CONTROL. A correct APPLIED note on an evidenced-live file must stay '
          + 'silent — a guard that fires on the fix it asked for gets deleted within a week',
      expect: null,
      make: () => {
        const o = clone(order);
        o._order_notes[liveFile] = 'APPLIED 2026-09-05 (measured; additive/idempotent).';
        return [o, base];
      },
    },
    prose_about_staging_after_an_applied_lead: {
      what: 'THE SECOND NEGATIVE CONTROL. An honest note may discuss staging later in its body '
          + '("SAFE with a staged client deploy"). Only the LEADING claim is the claim',
      expect: null,
      make: () => {
        const o = clone(order);
        o._order_notes[liveFile] = 'APPLIED 2026-09-05. SAFE with a staged client deploy; it was '
          + 'STAGED for two days before that.';
        return [o, base];
      },
    },
  };

  let bad = 0;
  for (const [id, c] of Object.entries(CASES)) {
    const [o, b] = c.make();
    let got;
    try { got = classify(o, b).findings; }
    catch (e) {
      console.error(`  x  ${id} — UNEXPECTED ${e.harness ? 'HARNESS ' : ''}ERROR: `
        + `${String(e.message).split('\n')[0]}\n     ${c.what}`);
      bad += 1; continue;
    }
    if (c.expect === null) {
      if (!got.length) { console.log(`  ok  ${id.padEnd(38)} silent, as it must be`); continue; }
      console.error(`  x  ${id} — expected NO finding; got: ${got.map((f) => f.key).join(', ')}`
        + `\n     ${c.what}`);
      bad += 1; continue;
    }
    const hit = got.find((f) => f.key === c.expect);
    if (hit) console.log(`  ok  ${id.padEnd(38)} ${hit.key}`);
    else {
      console.error(`  x  ${id} — expected a finding keyed "${c.expect}"; got: `
        + `${got.map((f) => f.key).join(', ') || '(nothing)'}\n     ${c.what}`);
      bad += 1;
    }
  }

  if (bad) {
    console.error(`\n${bad} planted defect(s) were not caught by the assertion written for them.`);
    process.exit(1);
  }
  console.log(`\nall ${Object.keys(CASES).length} planted cases behaved as their named assertion requires`);
}

// ════════════════════════════════════════════════════════════════════════
async function main() {
  if (argv.includes('--selftest')) return selftest();

  const { order, base } = await load();
  const d = derive(order, base);
  assertNotVacuous(order, base, d);
  const notes = order._order_notes || {};

  if (argv.includes('--list')) {
    console.log(`EVIDENCED-LIVE (${d.evidence.size} file(s)) — last toucher of a body production carries:`);
    for (const f of [...d.evidence.keys()].sort()) {
      const c = claimOf(notes[f]);
      console.log(`  ${c.kind.padEnd(7)} ${f.padEnd(50)} ${d.evidence.get(f).map((x) => `${x.fn}:${x.how}`).join(', ')}`);
    }
    const silent = [...d.evidence.keys()].filter((f) => claimOf(notes[f]).kind === 'none');
    console.log(`\nEVIDENCED-ABSENT: ${d.absent.size} file(s). Notes with no claim token at all: `
      + `${silent.length} (a documentation gap, not a finding).`);
    console.log(`Baseline entries: ${base.functions.length}. Notes: ${Object.keys(notes).length}. `
      + `Orphan files: ${d.orphans.length}.`);
    return undefined;
  }

  const { findings, checked } = classify(order, base);
  if (findings.length) {
    console.error('THE DEPLOYMENT RECORD DISAGREES WITH THE MEASUREMENT:\n');
    for (const f of findings) console.error(`  ${f.key}\n    ${f.detail}\n`);
    console.error(`${findings.length} dishonest note(s) over ${checked} file(s) with a measured verdict.`);
    process.exit(1);
  }
  console.log(`apply-order honesty: ${checked} file(s) carry a measured verdict `
    + `(${d.evidence.size} evidenced-live, ${d.absent.size} evidenced-absent) and every note about `
    + 'them agrees with tests/live-hash-drift.baseline.json.');
  return undefined;
}

main().catch((e) => {
  console.error(e.harness ? `HARNESS: ${e.message}` : e);
  process.exit(e.harness ? 2 : 1);
});
