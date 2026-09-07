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
//   CR-1  per pinned file: comment lines, against an allowance that GROWS WITH
//         CODE and never shrinks with it                        (ceiling)
//   CR-2  per pinned file: comment lines naming a build (b\d{3}) (ceiling)
//   CR-3  the WHOLE corpus's b-number line total                 (ceiling)
//         — CR-2 alone can be satisfied by moving the archaeology into an
//           unpinned file; CR-3 is what makes moving it free and adding it red.
//   CR-4  a file that is in TODAY's 16 largest but is not pinned may not be
//         wordier than the WORST pinned ratio. The ceiling is derived from the
//         baseline, never authored: "no new large file may be wordier than the
//         wordiest file we already have."
//
// ── CR-1 IS MARGINAL, AND IT WAS NOT ALWAYS (re-specified 2026-09-07) ───────
// CR-1 shipped as a whole-file RATIO ceiling: comment/code today may not exceed
// comment/code at the baseline. That predicate goes RED WHEN CODE IS DELETED,
// which is the one thing this repository's cleanup program is FOR. Two proofs
// measured on the tree it first gated:
//
//   · src/settings-page.js — a lane replaced 11 lines of rendering with 7
//     better ones. Comments UNCHANGED at 371; code 986 → 982; ratio
//     0.376268 → 0.377800. RED, with nobody having written a word of prose.
//   · src/legacy.js — the icon extraction moved 1,044 lines into
//     src/render/icons.js, which is exactly what MONO-1/4/5 in the sibling
//     ratchet reward. The extracted unit was code-denser than the file average,
//     so the REMAINDER got proportionally wordier: 0.703794 → 0.710681. The
//     extraction moved the number further the wrong way (+0.006887) than the
//     build's new prose did (+0.005269). Two guards authored in one commit,
//     disagreeing about the same commit.
//
// A ratchet with a false positive is a ratchet somebody switches off — the
// sibling ratchet's own words. So the predicate is now MARGINAL:
//
//     comment_now ≤ comment_base + baseRate × max(0, code_now − code_base)
//
// Identical to the old rule whenever code GREW (both reduce to
// comment_base + baseRate·Δcode), so nothing about "you may write prose at the
// rate you write program" is relaxed. It differs in exactly one case — code
// LEFT the file — where removing code now neither buys headroom nor costs it.
// Adding prose to a file you are shrinking is still RED, and proven so by
// --selftest.
//
// ⚠ THE RATE MAY ONLY FALL. `--write` re-pins comment/code/bnum from today but
//   keeps `ratio` at min(today, previous), so a file cannot delete code, re-pin
//   a higher rate and buy prose with it. Without that clause the marginal form
//   would compound; with it the rate is a one-way ratchet like everything else
//   here.
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

/**
 * CR-1's ceiling, in comment LINES rather than in a ratio. The baseline count
 * plus the baseline RATE applied to the code the file has GAINED since — so a
 * file may write prose at the rate it already writes program, and a file that
 * SHEDS code (an extraction, a dead branch deleted) keeps the comments it has
 * without being asked to delete a proportional share of them.
 * `max(0, …)` is the whole re-specification: code leaving is worth zero, never
 * negative. Exported so --selftest can assert the identity with the old ratio
 * rule on the growth side.
 */
/** The rate a `--write` may pin: today's, or the previously-pinned one if that
 *  was lower. One-way, so a file cannot delete code, re-pin the higher ratio
 *  that produces, and spend it on prose. */
export function repinRate(todayRatio, prevRatio) {
  const was = Number(prevRatio);
  return Number.isFinite(was) ? Math.min(todayRatio, was) : todayRatio;
}

export function commentAllowance(now, base) {
  const rate = Number.isFinite(base.ratio) ? base.ratio : ratioOf(base);
  return base.comment + rate * Math.max(0, now.code - base.code);
}

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
    const allowance = commentAllowance(r, b);
    if (r.comment > allowance + EPS) {
      const grew = Math.max(0, r.code - b.code);
      fail('CR-1', `${file}: ${r.comment} comment lines against an allowance of `
        + `${Math.floor(allowance)} (${b.comment} at the baseline + ${b.ratio.toFixed(3)} × `
        + `${grew} code line(s) added). A file may gain comments only as fast as it gains code; `
        + 'deleting code neither buys headroom nor costs it.');
    } else if (r.comment < b.comment) {
      notes.push(`${file}: comment lines fell ${b.comment} → ${r.comment} `
        + `(ratio ${b.ratio.toFixed(3)} → ${r.ratio.toFixed(3)}) — run --write`);
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
    const prev = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
    const prevFiles = (prev && prev.files) || {};
    const files = {};
    for (const r of now.top) {
      /* THE RATE MAY ONLY FALL. Counts are re-pinned from today, but `ratio` —
         which is the marginal ALLOWANCE rate CR-1 spends — keeps the lower of
         today and whatever was pinned before. Without this, a file could delete
         code, re-pin the higher ratio that produces, and buy prose with it: the
         marginal form would compound instead of ratcheting. */
      files[r.file] = {
        total: r.total, comment: r.comment, code: r.code,
        ratio: repinRate(r.ratio, prevFiles[r.file] && prevFiles[r.file].ratio),
        bnum: r.bnum,
      };
    }
    writeFileSync(BASELINE, JSON.stringify({
      _why: 'CEILINGS, not targets. A pinned file may gain comment lines only as fast as it gains '
        + 'CODE lines (deleting code neither buys headroom nor costs it), the per-file marginal '
        + '`ratio` may only ever FALL on a re-pin, and the build-number archaeology may only '
        + 'shrink. Regenerated by `node tests/comment-ratio-ratchet.mjs --write` when a number '
        + 'falls — never to make a red build green (CLAUDE.md §2).',
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

  console.log('\n  ── the ALLOWANCE and the RE-PIN (the 2026-09-07 re-specification) ──');
  const B = { comment: 1000, code: 2000, ratio: 0.5 };
  const allow = [
    ['code UNCHANGED → the allowance is the baseline count', { code: 2000 }, 1000],
    ['+400 code buys 200 comment lines at the baseline rate', { code: 2400 }, 1200],
    ['−900 code buys NOTHING and costs nothing', { code: 1100 }, 1000],
    ['−2000 code (the file emptied) still costs nothing', { code: 0 }, 1000],
  ];
  for (const [label, nowRow, want] of allow) {
    const got = commentAllowance(nowRow, B);
    say(got === want, label, `  → allowance ${got} (want ${want})`);
  }
  /* IDENTITY WITH THE OLD RULE ON THE GROWTH SIDE. The re-spec must relax
     nothing where code was ADDED: for Δcode ≥ 0 the marginal allowance and the
     old whole-file ratio ceiling are the same number, to float noise. */
  let identical = true;
  for (let dk = 0; dk <= 3000; dk += 137) {
    if (Math.abs(commentAllowance({ code: B.code + dk }, B) - B.ratio * (B.code + dk)) > 1e-9) identical = false;
  }
  say(identical, 'the marginal rule is IDENTICAL to the old ratio ceiling for every Δcode ≥ 0');
  const repins = [
    ['a first pin takes today\'s rate', 0.71, undefined, 0.71],
    ['a rate that FELL is pinned', 0.62, 0.70, 0.62],
    ['a rate that ROSE keeps the old, lower one', 0.71, 0.70, 0.70],
  ];
  for (const [label, today, prev, want] of repins) {
    const got = repinRate(today, prev);
    say(Math.abs(got - want) < 1e-12, label, `  → pinned ${got} (want ${want})`);
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
  /* ⚠ EVERY ARM BELOW IS EXPRESSED RELATIVE TO THE CEILING, NOT TO TODAY'S TREE.
     The first version added +1 to today's counts, which only bit while the tree
     happened to sit exactly ON its baseline — the moment a build paid down
     archaeology (this one paid 59 corpus b-lines), CR-2 and CR-3 stopped firing
     and reported themselves green. An arm whose bite depends on how much slack
     the tree currently has is not a mutation proof, it is a coincidence. So each
     arm SETS the mutated value from `base`, and the debt-payment controls set it
     from `base` too. `bp` is the victim's own baseline row. */
  const bp = base.files[victim];
  const bend = (fn) => {
    const rows = real.rows.map((r) => ({ ...r }));
    const m = { rows, top: rows.slice(0, PINNED_COUNT), bnumTotal: real.bnumTotal, fileCount: real.fileCount };
    fn(m);
    m.bnumTotal = m.rows.reduce((n, r) => n + r.bnum, 0);
    return compare(m, base);
  };
  const pick = (m, f) => m.rows.find((r) => r.file === f);

  const arms = [
    ['80 comment lines added over the ceiling, code unchanged', 'CR-1', (m) => {
      const r = pick(m, victim); r.comment = bp.comment + 80; r.code = bp.code; r.ratio = ratioOf(r);
    }],
    ['one new "b512 did X" line over the pinned count', 'CR-2', (m) => {
      pick(m, victim).bnum = bp.bnum + 1;
    }],
    ['the archaeology MOVED into an unpinned file (CR-2 satisfied, CR-3 not)', 'CR-3', (m) => {
      const r = pick(m, victim);
      r.bnum = Math.max(0, bp.bnum - 5);     // pinned file goes DOWN — CR-2 is happy
      const small = m.rows[m.rows.length - 1];
      /* …and the corpus lands ONE line over its own ceiling, wherever the rest
         of the tree happens to sit today. */
      const restNow = m.rows.reduce((n, x) => n + (x === small ? 0 : x.bnum), 0);
      small.bnum = Math.max(0, base.bnumTotal + 1 - restNow);
    }],
    ['80 comment lines added while 500 code lines LEAVE (shrinking is not a licence)',
      'CR-1', (m) => {
        const r = pick(m, victim);
        r.comment = bp.comment + 80; r.code = bp.code - 500; r.ratio = ratioOf(r);
      }],
    ['prose grows FASTER than code: +300 comments for +100 code', 'CR-1', (m) => {
      const r = pick(m, victim);
      r.comment = bp.comment + 300; r.code = bp.code + 100; r.ratio = ratioOf(r);
    }],
    /* THE OTHER HALF OF THE SHRINK CASE, and the reason "deleting code is free"
       is not "deleting code is a licence". A unit is extracted and its PROSE is
       left behind: same code count as the baseline, plus the comments that were
       written to explain a block no longer in the file. Those comments are now
       describing something that is not here, which is the rot this guard exists
       to name — so an extraction is expected to take its narrative with it, and
       leaving it behind is RED. The clean extraction is the note above. */
    ['the code was extracted but its PROSE was left behind', 'CR-1', (m) => {
      const r = pick(m, victim);
      r.comment = bp.comment + Math.floor(bp.ratio * 1000); r.code = bp.code;
      r.ratio = ratioOf(r);
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
    ['PAYING THE DEBT: 300 comment lines deleted', 'comment lines fell', (m) => {
      const r = pick(m, victim); r.comment = bp.comment - 300; r.ratio = ratioOf(r);
    }],
    ['PAYING THE DEBT: every b-number line removed from the biggest file', 'b-number lines fell', (m) => {
      pick(m, victim).bnum = 0;
    }],
    /* THE RE-SPECIFICATION, AS AN ASSERTION. An EXTRACTION takes a code-dense
       unit out of a pinned file: 1,044 lines leave, 326 of them comments. The
       old whole-file ratio rule called that CR-1 RED — the same movement
       MONO-1/4/5 in the sibling ratchet reward. It must be a note. */
    ['PAYING THE DEBT: 1,044 lines EXTRACTED to src/render (718 code, 326 comment)',
      'comment lines fell', (m) => {
        const r = pick(m, victim);
        r.comment = bp.comment - 326; r.code = bp.code - 718; r.ratio = ratioOf(r);
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
    /* THE MEASURED FALSE POSITIVE THIS RE-SPEC EXISTS TO DELETE
       (src/settings-page.js, 2026-09-07): a lane replaced 11 lines of rendering
       with 7 better ones. Comments UNCHANGED; code 986 → 982; the old ratio rule
       went red on 0.376268 → 0.377800 with nobody having written a word. */
    ['NEGATIVE CONTROL: 4 CODE lines DELETED, comments untouched', (m) => {
      const r = pick(m, victim);
      r.comment = bp.comment; r.code = bp.code - 4; r.total -= 4; r.ratio = ratioOf(r);
    }],
    ['NEGATIVE CONTROL: 900 CODE lines deleted, comments untouched', (m) => {
      const r = pick(m, victim);
      r.comment = bp.comment; r.code = bp.code - 900; r.total -= 900; r.ratio = ratioOf(r);
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
