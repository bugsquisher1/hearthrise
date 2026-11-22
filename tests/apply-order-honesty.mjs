#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/apply-order-honesty.mjs — THE DEPLOYMENT RECORD MUST NOT LIE.
//
//   node tests/apply-order-honesty.mjs             the guard (credential-free, CI)
//   node tests/apply-order-honesty.mjs --list      what it derived, and from what
//   node tests/apply-order-honesty.mjs --selftest  plant both defects, require each caught
//
// ── THE FAILURE THIS EXISTS TO KILL ─────────────────────────────────────────
// 2026-09-06: the apply-order record's notes (then tests/schema-apply-order.json's `_order_notes`, since
// 2026-11-19 one sidecar per migration: supabase/migration-notes/<file>.sql.json) said "STAGED, NOT
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
// This does, in the only place it is cheap: the sidecars and the baseline, no database, no
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
// The mirror case (2026-11-22): a file that restates a body BYTE FOR BYTE as the
// toucher before it installs nothing new, so production matching the chain says
// nothing about whether the LATER file ran either. A generated catalogue restates
// its trigger function in every forward file (hr_live_events_guard: 2027-03-22,
// 2027-05-01, 2027-05-07, then 1042, staged, whose honest note this rule called
// stale-staged off a live body measured the day before 1042 was written). The
// evidence walks back over every such identical restatement to the first file of
// the run. Only a literal create the static reader can compare counts as the
// same; anything else (an anchored patch, a file it cannot read) leaves the
// evidence on the last toucher, the loud direction.
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
import { readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { loadApplyOrder, knownFiles, MIG_DIR } from '../tools/lib/apply-order.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
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

// ── AN IDENTICAL RESTATEMENT (the mirror case in the header) ───────────────
/* A migration's text by file name, or null when it cannot be read (the reader the guard runs with; the selftest plants its own). */
const textCache = new Map();
export function migrationText(file) {
  if (!textCache.has(file)) {
    let t = null;
    try { t = readFileSync(join(ROOT, MIG_DIR, file), 'utf8'); } catch { t = null; }
    textCache.set(file, t);
  }
  return textCache.get(file);
}

/**
 * Every LITERAL `create [or replace] function public.<name>(` a file makes, as text: from the head to the `;` after its dollar-quoted
 * body, whitespace collapsed. Comments outside the body go; comments INSIDE it stay, because they are prosrc and the baseline's md5
 * reads them (a file that only re-words a comment in the body did install something new). Pure.
 * @param {string|null} sql
 * @param {string} name
 * @returns {string[]}
 */
export function restatementsOf(sql, name) {
  const src = String(sql || '').replace(/\r\n/g, '\n');
  const out = [];
  const head = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, 'gi');
  for (const m of src.matchAll(head)) {
    if (src.slice(src.lastIndexOf('\n', m.index) + 1, m.index).includes('--')) continue;   // a comment that names it
    const tag = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/g;
    tag.lastIndex = m.index;
    const open = tag.exec(src);
    if (!open) continue;
    const close = src.indexOf(open[0], open.index + open[0].length);
    if (close < 0) continue;
    const after = close + open[0].length;
    const semi = src.indexOf(';', after);
    const bare = (s) => s.replace(/--[^\n]*/g, ' ');
    out.push((bare(src.slice(m.index, open.index)) + src.slice(open.index, after) + bare(src.slice(after, semi < 0 ? src.length : semi + 1)))
      .replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** Does file `b` restate `name` exactly as file `a` did (both literal, the same text)? Never true for a body it cannot read. */
export function sameRestatement(name, a, b, text = migrationText) {
  const x = restatementsOf(text(a), name), y = restatementsOf(text(b), name);
  return x.length > 0 && x.length === y.length && x.every((s, i) => s === y[i]);
}

// ── THE PER-FILE VERDICT, DERIVED FROM THE BASELINE ────────────────────────
/**
 * @param {object} order the apply order (tools/lib/apply-order.mjs loadApplyOrder: the old JSON's shape)
 * @param {object} base  the parsed live-hash-drift.baseline.json
 * @param {(file: string) => (string|null)} [text]  a migration's text (the identical-restatement walk-back)
 * @returns {{evidence:Map<string,{how:string,fn:string}[]>, absent:Map<string,string[]>,
 *            orphans:string[], replayed:Set<string>}}
 */
export function derive(order, base, text = migrationText) {
  const replayed = [...(order.pre_schema || []), ...(order.order || [])];
  const idx = new Map(replayed.map((f, i) => [f, i]));
  /* excluded and RETIRED files are accounted for: a retired catalogue is history the replay skips, not an orphan */
  const known = knownFiles(order);

  const evidence = new Map();   // file -> [{how, fn}]  proven ON production
  const absent = new Map();     // file -> [fn]         proven NOT on production
  const orphans = new Set();

  for (const e of base.functions || []) {
    const touched = e.touched_by || [];
    for (const f of touched) if (!known.has(f)) orphans.add(f);
    const chain = touched.filter((f) => idx.has(f)).sort((a, f) => idx.get(a) - idx.get(f));
    if (!chain.length) continue;
    const last = chain[chain.length - 1];
    if (!e.live) { absent.set(last, [...(absent.get(last) || []), e.name]); continue; }
    let how = null;
    if (e.replay && e.live.md5 === e.replay.md5) how = 'hash';
    else if (/\bCODE-IDENTICAL\b/.test(String(e.why || ''))) how = 'codediff';
    if (!how) continue;   // a divergence nobody has explained proves nothing either way
    /* the mirror case: an identical restatement installs nothing new, so the evidence is the first file of the identical run's */
    let at = chain.length - 1;
    while (at > 0 && sameRestatement(e.name, chain[at - 1], chain[at], text)) at -= 1;
    evidence.set(chain[at], [...(evidence.get(chain[at]) || []), { how, fn: e.name }]);
  }
  return { evidence, absent, orphans: [...orphans].sort(), replayed: new Set(replayed) };
}

// ── THE CLASSIFIER — pure, so the selftest needs no files ──────────────────
export function classify(order, base, text = migrationText) {
  const findings = [];
  const say = (key, detail) => findings.push({ key, detail });
  const notes = order._order_notes || {};
  const { evidence, absent, orphans } = derive(order, base, text);

  for (const f of orphans) {
    say(`orphan-file ${f}`,
      'tests/live-hash-drift.baseline.json names this migration in a touched_by list and '
      + 'the apply order (supabase/migration-notes) accounts for it in neither order, pre_schema, excluded nor retired. '
      + 'The two records of what this database is made of have structurally drifted; fix that '
      + 'before trusting either.');
  }

  for (const [file, ev] of evidence) {
    const claim = claimOf(notes[file]);
    if (claim.kind !== 'staged') continue;
    const why = ev.map((x) => `${x.fn} (${x.how})`).join(', ');
    say(`stale-staged ${file}`,
      `the note claims STAGED / NOT APPLIED, and the live-hash baseline proves this file is the `
      + `LAST file in the apply order (or the first of an identical restatement run that ends it) touching ${why} with production carrying the body the chain `
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
    throw harness('the apply order carries no notes to check (supabase/migration-notes)');
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
  let order;
  try { order = loadApplyOrder(ROOT); }
  catch (e) { throw harness(`cannot derive the apply order: ${String(e.message || e)}`); }
  return { order, base: await one(BASELINE_FILE) };
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
  /* THE MIRROR PAIR: two planted files at the end of the order touching one planted body that production carries (live = replay),
     each file's text planted in memory beside the real reader. */
  const FIRST = '9999-99-97-planted-first.sql', AGAIN = '9999-99-97-planted-again.sql';
  const RESTATE = (ret, note) => 'create or replace function public.hr_selftest_restated()\nreturns trigger language plpgsql as $fn$\nbegin\n'
    + (note ? '  -- ' + note + '\n' : '') + '  return ' + ret + ';\nend $fn$;\nrevoke all on function public.hr_selftest_restated() from public;\n';
  const restated = (notes, texts) => () => {
    const o = clone(order); const b = clone(base);
    o.order = [...o.order, FIRST, AGAIN];
    Object.assign(o._order_notes, notes);
    b.functions = [...b.functions, {
      sig: 'hr_selftest_restated()', name: 'hr_selftest_restated', tracked_by: ['restate'], touched_by: [FIRST, AGAIN],
      live: { md5: 'b'.repeat(32), norm_len: 64, measured: '2026-11-20', source: 'measured-live' },
      replay: { md5: 'b'.repeat(32), norm_len: 64, source: 'computed-from-replay' }, agree: true,
    }];
    return [o, b, (f) => (f in texts ? texts[f] : migrationText(f))];
  };
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
    retired_file_is_not_an_orphan: {
      what: 'THE RETIREMENT CONTROL (2026-11-19). A superseded catalogue moved to supabase/migrations-retired/ is '
          + 'still accounted for: the baseline may name it in touched_by and it is not an orphan. Paired with the '
          + 'orphan case above, which proves an UNaccounted name still is',
      expect: null,
      make: () => {
        const o = clone(order); const b = clone(base);
        o.retired = { ...(o.retired || {}), '9999-99-98-planted-retired.sql': { seq: 1, superseded_by: o.order[o.order.length - 1] } };
        b.functions[0] = { ...b.functions[0],
          touched_by: [...b.functions[0].touched_by, '9999-99-98-planted-retired.sql'] };
        return [o, b];
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
    identical_restatement_is_not_evidence: {
      what: 'THE MIRROR CONTROL (2026-11-22, 1042). A staged file restating a live body BYTE FOR BYTE installs nothing new: production '
          + 'carrying that body proves the earlier file ran, not this one, so its honest STAGED note stays silent',
      expect: null,
      make: restated({ [FIRST]: 'APPLIED 2026-11-07 (the apply tool).', [AGAIN]: 'STAGED, NOT APPLIED (the next release).' },
        { [FIRST]: RESTATE('new'), [AGAIN]: '-- a forward file of the generator\n' + RESTATE('new') }),
    },
    changed_restatement_is_evidence: {
      what: 'the walk-back stops at a CHANGE: a staged last toucher whose body differs from the one before it, with production '
          + 'carrying the chain end, is applied and its STAGED note is the lie',
      expect: `stale-staged ${AGAIN}`,
      make: restated({ [FIRST]: 'APPLIED 2026-11-07 (the apply tool).', [AGAIN]: 'STAGED, NOT APPLIED (the next release).' },
        { [FIRST]: RESTATE('new'), [AGAIN]: RESTATE('null') }),
    },
    a_comment_inside_the_body_is_a_change: {
      what: 'a comment INSIDE the body is prosrc (the baseline md5 reads it): a file that only re-words one still installed a new body',
      expect: `stale-staged ${AGAIN}`,
      make: restated({ [FIRST]: 'APPLIED 2026-11-07 (the apply tool).', [AGAIN]: 'STAGED, NOT APPLIED (the next release).' },
        { [FIRST]: RESTATE('new'), [AGAIN]: RESTATE('new', 'the range, held by the database too') }),
    },
    identical_run_all_staged_is_a_lie: {
      what: 'the walk-back moves the verdict, never drops it: when EVERY file of an identical run claims STAGED, production carrying '
          + 'the body proves the first of them ran',
      expect: `stale-staged ${FIRST}`,
      make: restated({ [FIRST]: 'STAGED, NOT APPLIED (planted).', [AGAIN]: 'STAGED, NOT APPLIED (the next release).' },
        { [FIRST]: RESTATE('new'), [AGAIN]: RESTATE('new') }),
    },
    unreadable_restatement_stays_loud: {
      what: 'a toucher the static reader cannot compare (an anchored patch: no literal create) is never "the same": the evidence '
          + 'stays on the last toucher, the loud direction',
      expect: `stale-staged ${AGAIN}`,
      make: restated({ [FIRST]: 'APPLIED 2026-11-07 (the apply tool).', [AGAIN]: 'STAGED, NOT APPLIED (the next release).' },
        { [FIRST]: RESTATE('new'), [AGAIN]: "do $p$ declare v_def text := pg_get_functiondef('public.hr_selftest_restated()'::regprocedure); "
          + "begin execute v_def; end $p$;\n" }),
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
    const [o, b, text] = c.make();
    let got;
    try { got = classify(o, b, text).findings; }
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

/* imported (tests/live-hash-drift.mjs --selftest grades its attribution through classify()): no run */
if (isMain(import.meta.url)) {
  main().catch((e) => {
    console.error(e.harness ? `HARNESS: ${e.message}` : e);
    process.exit(e.harness ? 2 : 1);
  });
}
