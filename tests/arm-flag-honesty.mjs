// ============================================================================
// tests/arm-flag-honesty.mjs — AN ARM FLAG'S COMMENT MUST MATCH ITS VALUE.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// The server-authority cutover (b454, 953bd626, 2026-08-22) flipped every arm
// flag in one commit and rewrote almost none of the comments above them. For
// months the codebase therefore SAID "DORMANT — post-wipe rollout only" over a
// literal `true` in eight places: FARM_SERVER_ARM_ENABLED, INVENTORY_ARM_ENABLED,
// WORKER_PRODUCTION_SERVER_BACKED, BLOB_RETIRED, and the skills / rested /
// equipment / rooms record arms.
//
// That is not a cosmetic defect. On 2026-08-31 the identical staleness on
// MARKS_RECORD_ARM_ENABLED produced a real misdiagnosis: a bounty-board bug was
// triaged on the premise that "marks are client-authored today" — read straight
// off the comment — when clientMayWriteRecordField('marks') had been false since
// b454. An arm flag's comment is the ONLY documentation of where authority lives
// for that field, and every reader (human or agent) trusts it before the value.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//   A1  for every `export const *_ARM_ENABLED / *_SERVER_BACKED / BLOB_RETIRED`
//       in src/**, whose initialiser is a boolean LITERAL: if the literal is
//       `true`, no dormancy word (dormant / disarmed / reverted / "shipped
//       inert") may appear in its comment — the trailing comment on the const
//       line, plus the contiguous comment block within 12 lines above it.
//   A2  the vice-versa: if the literal is `false`, the same comment may not
//       shout LIVE / ARMED / "armed since" — a false flag that reads as live is
//       the same misdiagnosis with the sign flipped.
//   A3  THE CONTROL (--selftest). Both directions are re-run against synthetic
//       sources that DO lie, and the guard must report exactly them. A guard
//       that has never been red is not a guard.
//
// Deliberately NOT asserted: that the comment is *accurate* about the mechanism.
// Only a human can check that. This bites the one failure that recurs and is
// mechanically detectable — the word and the value disagreeing.
//
// Historical quoting is allowed and must stay allowed (the marks block explains
// its own stale-comment incident), so the dormancy words are matched only OUTSIDE
// double quotes: put a historical claim in "quotes" and the guard reads it as a
// quotation, not as a description of the current value.
//
// Usage:  node tests/arm-flag-honesty.mjs [--list] [--selftest]
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

/** The flag shape this guard owns. Kept as ONE regex so "which consts count" is
 *  stated once; a new arm flag is covered the moment it is named to convention. */
const FLAG_RE = /^\s*export\s+const\s+([A-Z0-9_]*(?:_ARM_ENABLED|_SERVER_BACKED)|BLOB_RETIRED)\s*=\s*(true|false)\s*;(.*)$/;

/** Words that describe an UNARMED flag. Matched case-insensitively: the b454
 *  comments used "DORMANT", "dormant" and "REVERTED to dormant" interchangeably. */
const DORMANT_WORDS = /\b(dormant|disarmed|reverted|not\s+armed|un-?armed|defaults?\s+off|ships?\s+inert)\b/i;
/** Words that describe an ARMED flag. Matched UPPER-CASE only: prose routinely
 *  says "armed()" or "under arm" while describing the dormant path, and flagging
 *  those would train people to delete explanation. A shouted LIVE / ARMED is the
 *  claim a reader acts on. */
const ARMED_WORDS = /(?:^|[^A-Za-z])(LIVE|ARMED)(?![A-Za-z])/;

/** Strip "quoted historical claims" so a block may narrate its own past. */
function unquoted(s) {
  return s.replace(/"[^"\n]*"/g, ' ').replace(/“[^”\n]*”/g, ' ');
}

/** The comment a reader attributes to the const: its trailing comment plus the
 *  contiguous comment block within the 12 lines above it (blank lines break the
 *  block; anything that is not a comment line breaks it). */
export function commentFor(lines, idx, trailing) {
  const out = [];
  let inBlock = false;
  for (let i = idx - 1, n = 0; i >= 0 && n < 12; i--, n++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) break;
    // Walking upward: a line ending a /* */ block puts us inside it.
    const isLine = t.startsWith('//');
    const closes = t.includes('*/');
    const opens = /^\/\*/.test(t);
    if (!inBlock && !isLine && !closes && !(opens || t.startsWith('*'))) break;
    out.push(raw);
    if (closes) inBlock = true;
    if (opens) inBlock = false;
  }
  out.reverse();
  if (trailing) out.push(trailing);
  return out.join('\n');
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

/** The pure core: given {file -> source}, return findings + the flags seen. */
export function auditSources(sources) {
  const findings = [];
  const flags = [];
  for (const [file, src] of Object.entries(sources)) {
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = FLAG_RE.exec(lines[i]);
      if (!m) continue;
      const [, name, value, trailing] = m;
      const comment = commentFor(lines, i, trailing);
      const clean = unquoted(comment);
      const rec = { file, line: i + 1, name, value: value === 'true' };
      flags.push(rec);
      if (rec.value) {
        const hit = DORMANT_WORDS.exec(clean);
        if (hit) {
          findings.push(`${file}:${i + 1} ${name} = true, but its comment says `
            + `"${hit[0]}". The value is the truth; rewrite the comment to state that the `
            + `arm is LIVE (and since which build), or flip the value.`);
        }
      } else {
        const hit = ARMED_WORDS.exec(clean);
        if (hit) {
          findings.push(`${file}:${i + 1} ${name} = false, but its comment shouts `
            + `"${hit[1]}". A false flag that reads as armed is the same misdiagnosis with `
            + `the sign flipped; say INERT/DORMANT, or flip the value.`);
        }
      }
    }
  }
  return { findings, flags };
}

function loadSrc() {
  const sources = {};
  for (const p of walk(SRC)) sources[relative(ROOT, p).replace(/\\/g, '/')] = readFileSync(p, 'utf8');
  return sources;
}

// ── A3 THE CONTROL ──────────────────────────────────────────────────────────
function selftest() {
  const cases = [
    ['true flag described as DORMANT', {
      'fake/a.js': '/* ── THE ARM ──\n   Ships DORMANT until the wipe. */\n'
        + 'export const FAKE_ARM_ENABLED = true;   // post-wipe only\n',
    }, 'FAKE_ARM_ENABLED'],
    ['true flag with the lie in the TRAILING comment only', {
      'fake/b.js': 'export const FAKE_SERVER_BACKED = true;   // REVERTED to dormant b425\n',
    }, 'FAKE_SERVER_BACKED'],
    ['false flag shouting LIVE', {
      'fake/c.js': '/* This one is LIVE since b454. */\nexport const BLOB_RETIRED = false;\n',
    }, 'BLOB_RETIRED'],
  ];
  let bad = 0;
  for (const [what, sources, expect] of cases) {
    const { findings } = auditSources(sources);
    const ok = findings.length === 1 && findings[0].includes(expect);
    console.log(`  ${ok ? '✓' : '✗'} bites: ${what}`);
    if (!ok) { bad++; console.log(`      got ${findings.length} finding(s): ${findings.join(' | ')}`); }
  }
  // …and the negative control: honest sources produce nothing.
  const honest = {
    'fake/d.js': '/* LIVE since b454 (2026-08-22). */\nexport const FAKE_ARM_ENABLED = true;\n',
    'fake/e.js': '/* INERT — superseded, defaults off. */\nexport const FAKE2_ARM_ENABLED = false;\n',
    // A block quoting its own stale history must stay legal.
    'fake/f.js': '/* This said "DORMANT — post-wipe only" for 32 builds. It is LIVE. */\n'
      + 'export const FAKE3_ARM_ENABLED = true;\n',
    // A comment further than 12 lines above is not attributed to the const.
    'fake/g.js': '/* DORMANT */\n' + '\n'.repeat(14) + 'export const FAKE4_ARM_ENABLED = true;\n',
  };
  const { findings, flags } = auditSources(honest);
  const ok = findings.length === 0 && flags.length === 4;
  console.log(`  ${ok ? '✓' : '✗'} passes: honest comments (incl. a quoted history and a distant comment)`);
  if (!ok) { bad++; console.log(`      ${flags.length} flag(s), findings: ${findings.join(' | ')}`); }
  // …and the vacuity control: the real tree must actually contain flags.
  const real = auditSources(loadSrc());
  const seen = real.flags.length >= 10;
  console.log(`  ${seen ? '✓' : '✗'} not vacuous: ${real.flags.length} real arm flag(s) found under src/`);
  if (!seen) bad++;
  if (bad) { console.error(`arm-flag-honesty --selftest: ${bad} control(s) failed.`); process.exit(1); }
  console.log('arm-flag-honesty --selftest: all controls green.');
  process.exit(0);
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  if (argv.includes('--selftest')) selftest();
  const { findings, flags } = auditSources(loadSrc());
  if (argv.includes('--list')) {
    for (const f of flags.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      console.log(`  ${String(f.value).padEnd(5)} ${f.name.padEnd(38)} ${f.file}:${f.line}`);
    }
  }
  if (!flags.length) {
    console.error('arm-flag-honesty: found NO arm flags under src/ — the scanner is broken, not the code.');
    process.exit(1);
  }
  if (findings.length) {
    console.error(`Arm-flag honesty — ${findings.length} comment(s) disagree with their value:`);
    for (const f of findings) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`Arm-flag honesty — all ${flags.length} arm flag(s) under src/ carry a comment that matches the value `
    + `(${flags.filter((f) => f.value).length} armed, ${flags.filter((f) => !f.value).length} inert).`);
  process.exit(0);
}
