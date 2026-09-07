#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/comment-ratio-ratchet.mjs — THE NARRATIVE MAY NOT OUTGROW THE CODE
//                                    (cleanup slice 1b)
//
//   node tests/comment-ratio-ratchet.mjs             gate against the baseline
//   node tests/comment-ratio-ratchet.mjs --report    print the tables, gate too
//   node tests/comment-ratio-ratchet.mjs --write     re-record the baseline
//   node tests/comment-ratio-ratchet.mjs --selftest  mutation proof
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// Measured on 2026-09-07, src/net/record.js is 1,145 comment lines over 655 code
// lines — a ratio of 1.75 — and src/net/accrue.js is 1.53. Those two files are
// more prose than program. This repository's comments are unusually good and
// that is exactly the problem being guarded: because they are good, writing more
// of them always feels like the responsible act, and nobody has ever been told
// no. Meanwhile 1,334 lines inside src/features/smoke-test.js and 854 inside
// src/legacy.js narrate a BUILD NUMBER — "b493 did X", "b511 changed Y" — which
// is archaeology, not documentation. The build that changed something is in
// `git log` and in CHANGELOG.md, permanently, for free.
//
// The cost is not aesthetic. A 1.75 ratio means a reader looking for the code
// path reads two lines of history for every line of program, and it means a
// behaviour change three builds later has to be reconciled against paragraphs
// that describe a world that no longer exists — which is how a comment starts
// lying. tests/arm-flag-honesty.mjs exists in this repo because exactly that
// happened to eight flags at once.
//
// So: no file may get proportionally wordier than it is today, and the
// build-number archaeology may only go down. Writing a NEW comment is free as
// long as you are also writing code; converting an obsolete paragraph into a
// deleted one lowers the ceiling (--write).
//
// ── WHAT IS RATCHETED ───────────────────────────────────────────────────────
//   CR-1  per pinned file: comment lines ÷ code lines           (ceiling)
//   CR-2  per pinned file: comment lines naming a build (b\d{3}) (ceiling)
//   CR-3  the WHOLE corpus's b-number line total                 (ceiling)
//         — CR-2 alone can be satisfied by moving the archaeology into an
//           unpinned file; CR-3 is what makes moving it free and adding it red.
//   CR-4  a file that is in TODAY's 16 largest but is not pinned may not be
//         wordier than the WORST pinned ratio. The ceiling is derived from the
//         baseline, never authored: "no new large file may be wordier than the
//         wordiest file we already have."
//
// ── WHY 16, AND WHY BY SIZE ─────────────────────────────────────────────────
// The rule is about the files a person actually has to read to change something,
// and that set is the big ones. 16 covers every file over ~1,300 lines today
// (the smallest pinned file is src/net/gold.js at 1,326) and stops well short of
// the data tables, where a low ratio is correct and meaningless. The SET is
// pinned by path, so rank shuffling never moves a ceiling; CR-4 is what keeps a
// newly-large file from being an unguarded hiding place until the next --write.
//
// ── COUNTING (the method, printed by --report so it is never folklore) ──────
//  · Physical lines, classified once each: BLANK / COMMENT / CODE.
//  · COMMENT = the trimmed line begins `//` or `/*`, or the line is inside an
//    unterminated block comment. A line with code AND a trailing comment counts
//    as CODE — the ratio asks "how much of this file is prose you must read
//    past", and a trailing note is not that.
//  · Blank lines are counted but belong to neither side; a file cannot lower its
//    ratio by adding whitespace.
//  · A b-number line is a COMMENT line matching /\bb\d{3}\b/ — a trailing
//    comment on a code line counts too, because the archaeology is the debt
//    wherever it sits.
//  · Ratios compare with a 1e-9 epsilon: a ratio that is arithmetically equal
//    must never be red from float noise.
//
// Credential-free, database-free, milliseconds.
// Exit: 0 green (or green-with-note) · 1 a ratio rose · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const BASELINE = join(ROOT, 'tests', 'comment-ratio-ratchet.baseline.json');

/** How many of the largest files carry a per-file ceiling. See the header. */
export const PINNED_COUNT = 16;
/** Float slack: an arithmetically equal ratio must never read as a rise. */
const EPS = 1e-9;
const BNUM_RE = /\bb\d{3}\b/;

/**
 * Classify every physical line of a JS source exactly once.
 * Pure: text in, counts out — which is what lets --selftest feed it synthetic
 * sources and require each classification by name.
 */
export function classify(text) {
  const lines = text.split(/\r?\n/);
  let inBlock = false;
  let comment = 0; let code = 0; let blank = 0; let bnum = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { blank++; continue; }

    let isComment = false;
    let hasCode = false;
    /* For a CODE line, where its trailing comment (if any) starts. -1 = none.
       Only the text from here on may contribute a b-number: `const b493 = 1;`
       and `const s = "b493";` are code and a string, not archaeology. */
    let trailingCommentAt = -1;

    if (inBlock) {
      isComment = true;
      const end = line.indexOf('*/');
      if (end >= 0) { inBlock = false; if (line.slice(end + 2).trim()) hasCode = true; }
    } else if (line.startsWith('//')) {
      isComment = true;
    } else if (line.startsWith('/*')) {
      isComment = true;
      const end = line.indexOf('*/', 2);
      if (end < 0) inBlock = true;
      else if (line.slice(end + 2).trim()) hasCode = true;
    } else {
      hasCode = true;
      // A code line that OPENS a block comment and does not close it. Guarded
      // against the obvious false positive — a `/*` inside a string or regex —
      // by requiring no quote character before it on the line. This is a line
      // classifier, not a JS parser, and it says so.
      const o = line.lastIndexOf('/*');
      if (o >= 0 && line.indexOf('*/', o + 2) < 0 && !/["'`]/.test(line.slice(0, o))) inBlock = true;
      const marks = [line.indexOf('//'), o].filter((i) => i >= 0);
      if (marks.length) trailingCommentAt = Math.min(...marks);
    }

    if (hasCode) {
      code++;
      if (trailingCommentAt >= 0 && BNUM_RE.test(line.slice(trailingCommentAt))) bnum++;
    } else {
      comment++;
      if (BNUM_RE.test(line)) bnum++;
    }
  }
  return { comment, code, blank, bnum, total: lines.length };
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const ratioOf = (r) => (r.code ? r.comment / r.code : (r.comment ? Infinity : 0));

/** Every JS file under src/, measured, largest first. */
export function measure(root) {
  const base = join(root, 'src');
  const rows = walk(base).map((p) => {
    const rel = 'src/' + relative(base, p).split(sep).join('/');
    const c = classify(readFileSync(p, 'utf8'));
    return { file: rel, ...c, ratio: ratioOf(c) };
  }).sort((a, b) => b.total - a.total || a.file.localeCompare(b.file));
  return {
    rows,
    top: rows.slice(0, PINNED_COUNT),
    bnumTotal: rows.reduce((n, r) => n + r.bnum, 0),
    fileCount: rows.length,
  };
}

export function compare(now, base) {
  const problems = [];
  const notes = [];
  const fail = (check, message) => problems.push({ check, message });

  const pinned = new Map(Object.entries((base && base.files) || {}));
  const byFile = new Map(now.rows.map((r) => [r.file, r]));

  // CR-1 / CR-2 — the pinned ceilings.
  for (const [file, b] of pinned) {
    const r = byFile.get(file);
    if (!r) { notes.push(`${file}: gone from src/ — run --write`); continue; }
    if (r.ratio > b.ratio + EPS) {
      fail('CR-1', `${file}: comment:code ${b.ratio.toFixed(3)} → ${r.ratio.toFixed(3)} `
        + `(${b.comment}/${b.code} → ${r.comment}/${r.code}). A file may gain comments only as `
        + 'fast as it gains code.');
    } else if (r.ratio < b.ratio - EPS) {
      notes.push(`${file}: ratio fell ${b.ratio.toFixed(3)} → ${r.ratio.toFixed(3)} — run --write`);
    }
    if (r.bnum > b.bnum) {
      fail('CR-2', `${file}: build-number narrative lines ${b.bnum} → ${r.bnum} (+${r.bnum - b.bnum}). `
        + 'Which build changed this is in `git log` and CHANGELOG.md, permanently and for free; '
        + 'a comment should say what the code does and why, not when.');
    } else if (r.bnum < b.bnum) {
      notes.push(`${file}: b-number lines fell ${b.bnum} → ${r.bnum} — run --write`);
    }
  }

  // CR-3 — the corpus total, which is what makes CR-2 unmovable rather than
  // merely relocatable.
  const bt = base && base.bnumTotal;
  if (!Number.isFinite(bt)) notes.push(`corpus b-number lines: no baseline (${now.bnumTotal}) — run --write`);
  else if (now.bnumTotal > bt) {
    fail('CR-3', `corpus build-number narrative lines ${bt} → ${now.bnumTotal} (+${now.bnumTotal - bt}) `
      + `across src/**. CR-2 is per file, so moving the archaeology into an unpinned file would `
      + 'satisfy it; this is the number that cannot be moved, only paid.');
  } else if (now.bnumTotal < bt) {
    notes.push(`corpus b-number lines fell ${bt} → ${now.bnumTotal} — run --write`);
  }

  // CR-4 — a NEW file in today's 16 largest, judged against a DERIVED ceiling.
  const worst = [...pinned.values()].reduce((m, b) => Math.max(m, b.ratio), 0);
  for (const r of now.top) {
    if (pinned.has(r.file)) continue;
    notes.push(`${r.file}: now in the ${PINNED_COUNT} largest and unpinned — run --write`);
    if (pinned.size && r.ratio > worst + EPS) {
      fail('CR-4', `${r.file}: comment:code ${r.ratio.toFixed(3)} is wordier than the worst pinned `
        + `file (${worst.toFixed(3)}), and it is now one of the ${PINNED_COUNT} largest in src/. `
        + 'A new large file does not get to start above the debt line.');
    }
  }

  return { problems, notes };
}

const METHOD = 'physical lines classified once each as BLANK / COMMENT / CODE; COMMENT = trimmed '
  + 'line starts // or /* or sits inside an unterminated block; a code line with a trailing comment '
  + 'counts as CODE; blanks belong to neither side; b-number line = a comment matching /\\bb\\d{3}\\b/ '
  + `(trailing comments included); ratio = comment/code; the ${PINNED_COUNT} largest files by total `
  + 'lines carry per-file ceilings, pinned BY PATH so rank shuffling moves nothing';

function printReport(now, base) {
  console.log('  method: ' + METHOD);
  console.log(`\n  rank file                                          total  comment   code   ratio  b-num`);
  now.top.forEach((r, i) => {
    console.log('  ' + String(i + 1).padStart(4) + ' ' + r.file.padEnd(44)
      + String(r.total).padStart(7) + String(r.comment).padStart(9) + String(r.code).padStart(7)
      + r.ratio.toFixed(3).padStart(8) + String(r.bnum).padStart(7));
  });
  const worst5 = [...now.top].sort((a, b) => b.ratio - a.ratio).slice(0, 5);
  console.log('\n  THE WORST FIVE (comment:code) — slice 1b\'s target list:');
  worst5.forEach((r, i) => {
    const b = base && base.files && base.files[r.file];
    console.log(`    ${i + 1}. ${r.file.padEnd(34)} ${r.ratio.toFixed(2).padStart(6)}  `
      + `(${r.comment} comment / ${r.code} code)`
      + (b ? `  ceiling ${b.ratio.toFixed(2)}` : '  UNPINNED'));
  });
  console.log(`\n  corpus: ${now.bnumTotal} build-number narrative line(s) across ${now.fileCount} `
    + 'file(s) in src/**');
  const topB = [...now.rows].sort((a, b) => b.bnum - a.bnum).slice(0, 5).filter((r) => r.bnum);
  for (const r of topB) console.log(`    ${r.file.padEnd(40)} ${String(r.bnum).padStart(5)}`);
}

export function run(argv = []) {
  const now = measure(ROOT);
  if (argv.includes('--write')) {
    const files = {};
    for (const r of now.top) {
      files[r.file] = { total: r.total, comment: r.comment, code: r.code, ratio: r.ratio, bnum: r.bnum };
    }
    writeFileSync(BASELINE, JSON.stringify({
      _why: 'CEILINGS, not targets. No pinned file may get proportionally wordier and the '
        + 'build-number archaeology may only shrink. Regenerated by '
        + '`node tests/comment-ratio-ratchet.mjs --write` when a number falls — never to make a red '
        + 'build green (CLAUDE.md §2).',
      _method: METHOD,
      measured: new Date().toISOString().slice(0, 10),
      pinnedCount: PINNED_COUNT,
      bnumTotal: now.bnumTotal,
      files,
    }, null, 2) + '\n');
    printReport(now, { files });
    console.log('\n✓ baseline written → tests/comment-ratio-ratchet.baseline.json');
    return 0;
  }
  if (!existsSync(BASELINE)) { console.error('COMMENT-RATIO: no baseline. Run --write once.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { problems, notes } = compare(now, base);
  if (argv.includes('--report')) printReport(now, base);

  if (problems.length) {
    console.error(`  ✗ comment-ratio ratchet: ${problems.length} count(s) ROSE`);
    for (const p of problems) console.error(`      ${p.check}  ${p.message}`);
    const worst5 = [...now.top].sort((a, b) => b.ratio - a.ratio).slice(0, 5);
    console.error('\n  the worst five today: '
      + worst5.map((r) => `${r.file.replace(/^src\//, '')} ${r.ratio.toFixed(2)}`).join(', '));
    console.error('  This guard does not ask you to delete good comments — only not to add prose');
    console.error('  faster than code, and not to write down a build number a machine already knows.');
    return 1;
  }
  const worst5 = [...now.top].sort((a, b) => b.ratio - a.ratio).slice(0, 5);
  console.log(`✓ comment-ratio ratchet: ${PINNED_COUNT} pinned file(s), ${now.bnumTotal} b-number `
    + 'narrative line(s) in src/** — none rose');
  console.log('      worst five: '
    + worst5.map((r) => `${r.file.replace(/^src\//, '')} ${r.ratio.toFixed(2)}`).join(', '));
  for (const n of notes) console.log(`      ${n}`);
  return 0;
}

/* ── MUTATION PROOF ──────────────────────────────────────────────────────
   Two halves, because a ratchet has two ways to be useless. The CLASSIFIER is
   proven on synthetic sources with a known answer (if it miscounts, every
   comparison below is meaningless and always green). The COMPARATOR is proven
   by planting one defect per assertion and requiring each to be caught by its
   NAMED check, plus the movements that must be notes and two controls. */
function selftest() {
  let bad = 0;
  const say = (ok, label, extra = '') => {
    if (ok) console.log(`  ok       ${label}${extra}`);
    else { bad++; console.log(`  WRONG    ${label}${extra}`); }
  };

  console.log('comment-ratio-ratchet --selftest\n  ── the CLASSIFIER (a wrong reader is green forever) ──');
  const cls = [
    ['a line comment', '// hello', { comment: 1, code: 0 }],
    ['a one-line block comment', '/* hello */', { comment: 1, code: 0 }],
    ['a three-line block comment', '/*\n * a\n */', { comment: 3, code: 0 }],
    ['code', 'const a = 1;', { comment: 0, code: 1 }],
    ['code with a TRAILING comment counts as CODE', 'const a = 1; // why', { comment: 0, code: 1 }],
    ['a blank line is neither', '\n', { comment: 0, code: 0, blank: 2 }],
    ['code after a block comment ends on the same line', '/* a */ const b = 2;', { comment: 0, code: 1 }],
    ['a `/*` inside a string does not open a block', 'const s = "/*"; \nconst t = 1;', { comment: 0, code: 2 }],
    ['jsdoc over code', '/** doc */\nfunction f() {}', { comment: 1, code: 1 }],
  ];
  for (const [label, src, want] of cls) {
    const g = classify(src);
    const okc = g.comment === want.comment && g.code === want.code
      && (want.blank === undefined || g.blank === want.blank);
    say(okc, label, `  → comment ${g.comment} code ${g.code} blank ${g.blank}`);
  }
  const bn = [
    ['a b-number in a comment counts', '// b493 changed this', 1],
    ['a b-number in a TRAILING comment counts', 'const a = 1; // b493 why', 1],
    ['a b-number in CODE does not count', 'const b493 = 1;', 0],
    ['a b-number in a STRING does not count', 'const s = "b493";', 0],
    ['a four-digit number is not a b-number', '// b4931 is not a build', 0],
    ['two b-numbers on one line is still one LINE', '// b493 and b494', 1],
  ];
  for (const [label, src, want] of bn) {
    const g = classify(src);
    say(g.bnum === want, label, `  → bnum ${g.bnum} (want ${want})`);
  }

  console.log('\n  ── the COMPARATOR ──');
  if (!existsSync(BASELINE)) { console.error('SELFTEST: no baseline; run --write first.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const real = measure(ROOT);
  const clean = compare(real, base);
  if (clean.problems.length) {
    console.error('SELFTEST HARNESS: the UNMUTATED tree already reports problems, so every "caught"');
    console.error('  below would be meaningless:');
    for (const p of clean.problems) console.error(`    ${p.check}  ${p.message}`);
    return 2;
  }
  console.log('  false-positive floor: the real tree reports 0 problems');

  const victim = real.top[0].file;
  const bend = (fn) => {
    const rows = real.rows.map((r) => ({ ...r }));
    const m = { rows, top: rows.slice(0, PINNED_COUNT), bnumTotal: real.bnumTotal, fileCount: real.fileCount };
    fn(m);
    m.bnumTotal = m.rows.reduce((n, r) => n + r.bnum, 0);
    return compare(m, base);
  };
  const pick = (m, f) => m.rows.find((r) => r.file === f);

  const arms = [
    ['80 comment lines added to the biggest file', 'CR-1', (m) => {
      const r = pick(m, victim); r.comment += 80; r.ratio = ratioOf(r);
    }],
    ['one new "b512 did X" line in a pinned file', 'CR-2', (m) => { pick(m, victim).bnum += 1; }],
    ['the archaeology MOVED into an unpinned file (CR-2 satisfied, CR-3 not)', 'CR-3', (m) => {
      const r = pick(m, victim);
      const moved = 5;
      r.bnum -= moved;                       // pinned file goes DOWN — CR-2 is happy
      const small = m.rows[m.rows.length - 1];
      small.bnum += moved + 1;               // +1 net across the corpus
    }],
    ['a NEW 2,000-line file, wordier than record.js, enters the top 16', 'CR-4', (m) => {
      const worst = Math.max(...Object.values(base.files).map((b) => b.ratio));
      const row = { file: 'src/features/brand-new.js', total: 2000, comment: 1400, code: 600, blank: 0, bnum: 0 };
      row.ratio = ratioOf(row);
      if (row.ratio <= worst) { row.comment = Math.ceil((worst + 0.5) * row.code); row.ratio = ratioOf(row); }
      m.rows.unshift(row);
      m.top = m.rows.slice(0, PINNED_COUNT);
    }],
  ];
  for (const [label, check, fn] of arms) {
    const got = bend(fn);
    const hit = got.problems.filter((p) => p.check === check);
    if (hit.length) console.log(`  CAUGHT   ${label}\n           ${check}: ${hit[0].message.split('. ')[0]}.`);
    else {
      bad++;
      console.log(`  MISSED   ${label} — ${check} never fired`
        + (got.problems.length ? ` (only: ${got.problems.map((p) => p.check).join(', ')})` : ' (no problem at all)'));
    }
  }

  const noted = [
    ['PAYING THE DEBT: 300 comment lines deleted', 'ratio fell', (m) => {
      const r = pick(m, victim); r.comment -= 300; r.ratio = ratioOf(r);
    }],
    ['PAYING THE DEBT: every b-number line removed from the biggest file', 'b-number lines fell', (m) => {
      pick(m, victim).bnum = 0;
    }],
  ];
  for (const [label, want, fn] of noted) {
    const got = bend(fn);
    if (got.problems.length) {
      bad++;
      console.log(`  FALSE +  ${label} — reported ${got.problems.map((p) => p.check).join(', ')}; `
        + 'paying the debt must be a NOTE, never a failure');
    } else if (!got.notes.some((n) => n.includes(want))) {
      bad++;
      console.log(`  SILENT   ${label} — no "${want}" note, so nobody is told to run --write`);
    } else console.log(`  note     ${label}`);
  }

  const controls = [
    ['NEGATIVE CONTROL: 200 BLANK lines added (whitespace cannot buy headroom)', (m) => {
      const r = pick(m, victim); r.blank += 200; r.total += 200;
    }],
    ['NEGATIVE CONTROL: 200 CODE lines added (writing code is always allowed)', (m) => {
      const r = pick(m, victim); r.code += 200; r.total += 200; r.ratio = ratioOf(r);
    }],
    ['NEGATIVE CONTROL: two pinned files swap rank', (m) => {
      const i = m.rows.findIndex((r) => r.file === real.top[2].file);
      const j = m.rows.findIndex((r) => r.file === real.top[3].file);
      const t = m.rows[i]; m.rows[i] = m.rows[j]; m.rows[j] = t;
      m.top = m.rows.slice(0, PINNED_COUNT);
    }],
  ];
  for (const [label, fn] of controls) {
    const got = bend(fn);
    if (got.problems.length) {
      bad++;
      console.log(`  FALSE +  ${label} — reported ${got.problems.map((p) => p.check).join(', ')}`);
    } else console.log(`  silent   ${label}`);
  }

  console.log(`\n  ${bad ? `${bad} arm(s) FAILED`
    : `${cls.length + bn.length} classifier cases correct, all ${arms.length} defects caught by their `
      + `named assertion, ${noted.length} debt-payments reported as notes, ${controls.length} controls silent`}`);
  return bad ? 1 : 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/comment-ratio-ratchet.mjs')) {
  process.exit(process.argv.includes('--selftest') ? selftest() : run(process.argv.slice(2)));
}
