#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/snapshot-allowlist-guard.mjs — WHAT A TEST WRITES TO `G`, `restoreG`
//                                      MUST PUT BACK
//
//   node tests/snapshot-allowlist-guard.mjs            gate (exit 1 on a finding)
//   node tests/snapshot-allowlist-guard.mjs --report   print every table, exit 0
//   node tests/snapshot-allowlist-guard.mjs --json     machine-readable findings
//   node tests/snapshot-allowlist-guard.mjs --selftest  mutation proof
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
// The in-page suite runs ~1,200 tests against ONE live `window.G`. Isolation is
// not a framework feature here — it is two hand-written functions in
// src/features/smoke-test.js:
//
//     snapshotG()   JSON.parse(JSON.stringify({ a: G.a, b: G.b, ... }))
//     restoreG(s)   for (const k of Object.keys(s)) G[k] = s[k]
//
// `snapshotG`'s object literal is a MANUAL ALLOWLIST. A test that writes a field
// the literal does not name is not isolated at all: the write survives its own
// `finally { restoreG(snap) }` and is inherited by every test registered after
// it, for the rest of the run. The symptom appears thousands of lines away from
// the cause, in a test that is working perfectly.
//
// Two MEASURED instances, both of which cost real debugging hours:
//
//   (1) 2026-09-11 — `b252: topbar activity bar routes to the CURRENT activity`
//       set `G.activeAction = {kind:'cook', targetId:'shrimp'}`. The strip
//       (`refreshActivityBar`) paints from FOUR pointers and the allowlist named
//       TWO of them, so ~2,000 later registrations inherited a topbar reading
//       "Cooking — shrimp". ACT-7 was the first test far enough down the file to
//       notice. Fixed in 27bae883 by adding the two missing fields — with
//       `|| null`, which is the second half of this guard (below).
//
//   (2) `F7-1` fails when it runs shortly after `B495-4`. B495-4 does snapshot,
//       does restore, and `traits` IS on the allowlist — so by the rule above it
//       is clean. It leaks anyway, and the reason is the JSON round-trip:
//
//         JSON.stringify DROPS a property whose value is `undefined`.
//
//       The fresh-character literal in src/legacy.js (`let G={...}`) has no
//       `traits` key — `G.traits` is created by `applyTraitUnlock()`, i.e. only
//       once a character has BOUGHT a trait. On a character who has not, the
//       snapshot of `traits: G.traits` produces NO KEY, `restoreG` iterates
//       `Object.keys(snap)` and therefore puts nothing back, and B495-4's
//       `G.traits = { auto_eat: true }` is permanent for the rest of the run.
//       F7-1 asserts the Settings screen locks auto-eat for a character WITHOUT
//       the trait, and the character it inherits owns it.
//
//       smoke-test.js already knows this: `activeArtisanRecipe`,
//       `activeArtisanSkill` and `activeAction` carry `|| null`, `lastWelcome`
//       and `recoveringUntilMs` carry `|| 0`, each with a header paragraph
//       explaining that JSON drops undefined. The knowledge is in five comments
//       and was never a rule, so the list keeps regrowing the hole.
//
// ── THE THREE RULES ─────────────────────────────────────────────────────
//   SNAP-1  UNLISTED. A test writes a top-level `G.<field>` that snapshotG's
//           allowlist does not name. The write outlives restoreG. RED.
//
//   SNAP-2  DROPPABLE. A test writes an allowlisted `G.<field>` whose snapshot
//           expression is a BARE read (`field: G.field`) AND whose key is not
//           GUARANTEED PRESENT on G — so the field can legitimately be
//           `undefined`, JSON drops it, and the allowlist entry protects nothing
//           on exactly the pages where the test's write matters most. RED. The
//           fix is one operator: `field: G.field || null` (or `?? null` where 0
//           and '' are meaningful values).
//
//           GUARANTEED PRESENT is measured from two files, never asserted here:
//             + every depth-1 key of the fresh-character literal `let G={…}`
//               (src/legacy.js), MINUS
//             − every `field:` on `SERVER_OF_RECORD` (src/net/record.js), which
//               `forgetServerOfRecord(G)` DELETES off the live G at the end of
//               every load. Those ten fields are in the literal and absent at
//               runtime anyway.
//
//   SNAP-3  UNSNAPSHOTTED. A test writes `G.<field>` and its body never takes a
//           snapshot at all (no snapshotG / restoreG / known fixture). REPORTED,
//           not gated — see "what this does not do".
//
// ── THE RULES WERE MEASURED, NOT REASONED ───────────────────────────────
// Reproduced 2026-09-11 against the real booted page (headless chromium, the
// `__HR_TEST_HARNESS__` bypass), running snapshotG/restoreG's exact semantics
// one field at a time on the live `G`:
//
//   G.traits      own property? NO  → snapshot kept no key → LEAKED    ← F7-1
//   G.gold        own property? NO  → snapshot kept no key → LEAKED    ← and
//                 `gold` IS in the fresh-character literal. It is gone anyway,
//                 because it is on SERVER_OF_RECORD and the load deletes it.
//                 That measurement is the whole reason SNAP-2 subtracts that
//                 registry instead of trusting the literal.
//   G.activeAction bare (the pre-27bae883 form)          → LEAKED      ← b252
//   G.activeAction with `|| null` (the shipped fix)      → clean
//
// So the `|| null` in commit 27bae883 is the correct shape of the fix, and the
// bare entries beside it are the same bug waiting for a writer.
//
// ── WHAT COUNTS AS A WRITE ──────────────────────────────────────────────
// `G.f = `, `window.G.f = `, compound assignment (`+=`, `||=`, …), `delete G.f`,
// and any nested write beneath them (`G.traits.auto_eat = 1` is a write to
// `traits`, because `traits` is the unit snapshotG copies and restoreG puts
// back — the deep JSON clone makes nested restoration free ONCE the top-level
// field is carried). `Object.assign(G, {...})` is a write whose field list is
// not statically decidable and is reported by name so it cannot hide.
//
// Only code INSIDE the `const TESTS = [ … ];` array counts. The shared fixtures
// above it (setAway, nightWorld, onFeet, withFarmServer) write G deliberately
// and restore it themselves; they are reviewed as fixtures, not as tests.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────
// It does not run the suite, and it cannot prove a leak — a static reader cannot
// know whether `G.traits` happened to be defined on the machine that ran. It
// answers the question that IS decidable from the tree and that nobody was
// answering: does every `G` write a test performs have a restoration path. A
// SNAP-2 finding is a field the snapshot protects only SOMETIMES, which is the
// same defect the file's own `|| null` comments describe.
//
// SNAP-3 is reported rather than gated because "took a snapshot" is a
// syntactic proxy for "restores what it wrote", and a test may legitimately
// hand its teardown to a fixture this guard has not been taught. Gating on a
// proxy trains people to satisfy the proxy. The list is printed so it can be
// read; promoting it is a decision for the Coordinator, not for this file.
//
// It also does not judge whether the allowlist entry is the RIGHT unit, whether
// a field belongs in the server record instead (CLAUDE.md §6), or whether a
// test should be touching G at all. Those are readings.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SUITE = join(ROOT, 'src', 'features', 'smoke-test.js');
const LEGACY = join(ROOT, 'src', 'legacy.js');
const RECORD = join(ROOT, 'src', 'net', 'record.js');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const REPORT = argv.includes('--report');
const SELFTEST = argv.includes('--selftest') || argv.includes('--mutate');

// ── TEXT HYGIENE ─────────────────────────────────────────────────────────
/* Comments and string literals are BLANKED, not deleted, so every line number
   this guard prints is the line number in the real file. A `G.x =` inside a
   comment or inside an assertion message is prose, not a write, and this repo's
   smoke-test.js is ~40% prose by line count — counting it would make the guard
   a random-noise generator on its first run. Template literals are blanked too,
   but `${}` interpolations are KEPT: `${G.gold = 1}` is real code. (No such
   thing exists today; blanking it would be a hole, not a simplification.) */
/* ⚠ REGEX LITERALS ARE THE REASON THIS IS A SCANNER AND NOT THREE `.replace()`
   CALLS. smoke-test.js is full of `/data-set="autoEatPct"/.test(html)`. A naive
   blanker sees the `"` inside the pattern, opens a string, and blanks forward to
   the next quote — hundreds of lines away. MEASURED on the first run of this
   guard: 607 of the file's 1,231 tests were invisible and the fresh-character
   literal in legacy.js came back EMPTY, which would have made SNAP-2 vacuous
   while the guard printed a confident table. Regex-vs-division is decided on the
   previous significant character, the standard heuristic. */
const REGEX_CAN_FOLLOW = /[({[,;:!&|?+\-*/%~^=<>]$/;
const blankNonCode = (src) => {
  /* ⚠ `split('')`, NEVER `Array.from`. Array.from iterates CODE POINTS and
     collapses a surrogate pair into one element, while `src[i]` indexes CODE
     UNITS — so the first 4-byte emoji in the file (this repo has several, and
     legacy.js's banner comments are full of them) puts the output array one
     slot behind the cursor and every blank after it lands on the wrong
     character. MEASURED: the whole of src/legacy.js after its first astral
     glyph came back blanked, including `let G={`, which silently reduced SNAP-2
     to "no fresh keys, therefore every bare entry is suspect". */
  const out = src.split('');
  const n = src.length;
  let i = 0;
  // 0 = code, 1 = line comment, 2 = block comment, 3 = ' , 4 = " , 5 = `
  let mode = 0;
  let prevSig = '';      // last non-space character emitted as CODE
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (mode === 0) {
      if (c === '/' && d === '/') { const s = i; while (i < n && src[i] !== '\n') i++; blank(s, i); continue; }
      if (c === '/' && d === '*') { const s = i; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i = Math.min(n, i + 2); blank(s, i); continue; }
      if (c === '/' && (prevSig === '' || REGEX_CAN_FOLLOW.test(prevSig) || /\breturn$|\btypeof$|\bcase$/.test(src.slice(Math.max(0, i - 8), i)))) {
        // a regex literal: blank the body (incl. its quotes/brackets), keep the slashes out of `prevSig`
        const s = i; i++;
        let inClass = false;
        while (i < n && src[i] !== '\n') {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { i++; break; }
          i++;
        }
        while (i < n && /[a-z]/.test(src[i])) i++;   // flags
        blank(s, i); prevSig = ')'; continue;
      }
      if (c === "'" || c === '"' || c === '`') { mode = c === "'" ? 3 : c === '"' ? 4 : 5; i++; blank(i - 1, i); prevSig = ')'; continue; }
      if (!/\s/.test(c)) prevSig = c;
      i++; continue;
    }
    // inside a string
    if (c === '\\') { blank(i, Math.min(n, i + 2)); i += 2; continue; }
    if (mode === 5 && c === '$' && d === '{') {
      // step over the interpolation, leaving it as code
      let depth = 0; i += 2;
      while (i < n) { if (src[i] === '{') depth++; else if (src[i] === '}') { if (!depth) { i++; break; } depth--; } i++; }
      continue;
    }
    const close = mode === 3 ? "'" : mode === 4 ? '"' : '`';
    if (c === close) { blank(i, i + 1); mode = 0; i++; continue; }
    blank(i, i + 1); i++;
  }
  return out.join('');
};

// ── 1. THE ALLOWLIST (snapshotG's object literal) ────────────────────────
/* `undefinedSafe` is the whole of SNAP-2: an entry written `f: G.f || null` or
   `f: G.f ?? 0` always produces a key, so restoreG always has something to put
   back. A bare `f: G.f` produces a key only when the field happens to exist. */
const readAllowlist = (code, lines) => {
  const start = lines.findIndex((l) => /^const snapshotG\s*=/.test(l));
  if (start < 0) return { start: -1, end: -1, fields: new Map() };
  let end = -1;
  for (let i = start; i < lines.length; i++) if (/^\s*\}\)\);\s*$/.test(lines[i])) { end = i; break; }
  if (end < 0) return { start, end: -1, fields: new Map() };
  const fields = new Map();
  const codeLines = code.split(/\r?\n/);
  for (let i = start; i <= end; i++) {
    const re = /([A-Za-z_$][\w$]*)\s*:\s*G\.([A-Za-z_$][\w$]*)([^,]*)/g;
    let m;
    while ((m = re.exec(codeLines[i]))) {
      fields.set(m[1], {
        line: i + 1,
        source: m[2],
        undefinedSafe: /^\s*(\|\||\?\?)/.test(m[3] || ''),
        text: lines[i].trim(),
      });
    }
  }
  return { start: start + 1, end: end + 1, fields };
};

// ── 2. THE FRESH-CHARACTER LITERAL (src/legacy.js `let G={…}`) ───────────
/* The evidence SNAP-2 rests on. A key present here is defined on EVERY
   character from the first frame, so a bare allowlist entry for it can never
   snapshot `undefined`. A key absent here exists only once some code path
   creates it — `G.traits` is created by applyTraitUnlock(), i.e. only after a
   purchase — so a bare entry for it is protection that a fresh account does not
   get. Depth-1 keys only: nested keys are inside a value the literal defines. */
const readFreshKeys = (legacySrc) => {
  const code = blankNonCode(legacySrc);
  const at = code.search(/^let G\s*=\s*\{/m);
  if (at < 0) return null;
  const open = code.indexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  const body = code.slice(open + 1, end);
  const keys = new Set();
  let d = 0;
  const re = /([A-Za-z_$][\w$]*)\s*:|[{}[\]()]/g;
  let m;
  while ((m = re.exec(body))) {
    const t = m[0];
    if (t === '{' || t === '[' || t === '(') { d++; continue; }
    if (t === '}' || t === ']' || t === ')') { d--; continue; }
    if (d === 0) keys.add(m[1]);
  }
  return keys;
};

// ── 2b. THE FIELDS THE LOAD DELETES (src/net/record.js SERVER_OF_RECORD) ──
/* The correction the fresh-character literal alone gets WRONG, and it was found
   by measuring rather than by reading: `gold` is in the literal, and on a booted
   page `G` has no `gold` own-property at all. record.js's own header states the
   rule — "a field on the SERVER_OF_RECORD registry is DELETED from every save
   blob" — and `loadLocal()` ends with `forgetServerOfRecord(G)`, so the whole
   family (gold, gems, skills, equipment, rooms, marks, dungeonScrip, restedXp,
   restedAt, offlineBudget) is absent until an envelope re-states it. Read from
   the registry itself so arming an eleventh field updates this guard for free. */
const readServerOfRecord = (recordSrc) => {
  const code = blankNonCode(recordSrc);
  const at = code.indexOf('SERVER_OF_RECORD');
  if (at < 0) return null;
  const open = code.indexOf('[', at);
  let depth = 0, end = -1;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  /* the NAMES are string literals, which blankNonCode erased — read them off the
     raw slice, bounded by the offsets the blanked scan established. */
  const raw = recordSrc.slice(open, end);
  const out = new Set();
  const re = /\bfield\s*:\s*'([A-Za-z_$][\w$]*)'/g;
  let m;
  while ((m = re.exec(raw))) out.add(m[1]);
  return out;
};

// ── 3. THE TESTS, AND WHAT EACH ONE WRITES ───────────────────────────────
const TEST_HEAD = /\(\)\s*=>\s*tryRun[A-Za-z]*\s*\(/;
/* A test is "snapshotted" if it takes one itself or hands teardown to one of
   the shared fixtures that does. Named explicitly rather than matched by a
   /restore/ pattern so a new fixture is a deliberate addition to this list and
   not an accidental exemption. SNAP-3 only. */
const SNAPSHOTTERS = [
  'snapshotG(', 'restoreG(', 'restoreGAndRecord(',
  'combatScreen(', 'autoEatMirrorFixture(', 'withServerBacked(',
];

const readTests = (code, lines) => {
  const startIdx = lines.findIndex((l) => /^const TESTS\s*=\s*\[/.test(l));
  if (startIdx < 0) return [];
  let endIdx = -1;
  for (let i = startIdx + 1; i < lines.length; i++) if (/^\];\s*$/.test(lines[i])) { endIdx = i; break; }
  if (endIdx < 0) endIdx = lines.length - 1;

  const codeLines = code.split(/\r?\n/);
  const heads = [];
  for (let i = startIdx + 1; i < endIdx; i++) {
    if (!TEST_HEAD.test(codeLines[i])) continue;
    // the NAME comes off the raw line (it is a string literal, blanked in `code`)
    const nm = /tryRun[A-Za-z]*\s*\(\s*(['"`])([\s\S]*?)\1/.exec(lines[i]);
    heads.push({ line: i + 1, name: nm ? nm[2] : '(unnamed @ line ' + (i + 1) + ')' });
  }
  return heads.map((h, k) => {
    const from = h.line - 1;
    const to = (k + 1 < heads.length ? heads[k + 1].line - 1 : endIdx);
    const body = codeLines.slice(from, to).join('\n');
    return { ...h, from, to, body, snapshotted: SNAPSHOTTERS.some((s) => body.includes(s)) };
  });
};

/* `(?<![\w$.])` keeps `savedG.x =` and `myG.x =` out; the optional `window.`
   prefix catches the other half of the file's idiom. The chain group is what
   makes `G.traits.auto_eat = 1` a write to `traits`. `=(?![=>])` excludes `==`,
   `===` and `=>`; a leading `!`/`<`/`>` cannot reach the operator group because
   the pattern demands whitespace-or-nothing between the chain and the operator. */
const WRITE_RE = /(?<![\w$.])(?:window\s*\.\s*)?G\s*\.\s*([A-Za-z_$][\w$]*)((?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[[^\]\n]*\])*)\s*(\|\|=|&&=|\?\?=|\+=|-=|\*=|\/=|%=|=(?![=>]))/g;
const DELETE_RE = /\bdelete\s+(?:window\s*\.\s*)?G\s*\.\s*([A-Za-z_$][\w$]*)/g;
const BULK_RE = /Object\s*\.\s*assign\s*\(\s*(?:window\s*\.\s*)?G\s*,/g;

const writesIn = (body, fromLine) => {
  const found = [];
  const push = (idx, field, how) => {
    const line = fromLine + body.slice(0, idx).split('\n').length;
    found.push({ field, how, line });
  };
  let m;
  WRITE_RE.lastIndex = 0;
  while ((m = WRITE_RE.exec(body))) push(m.index, m[1], m[2] ? 'nested' : 'assign');
  DELETE_RE.lastIndex = 0;
  while ((m = DELETE_RE.exec(body))) push(m.index, m[1], 'delete');
  BULK_RE.lastIndex = 0;
  while ((m = BULK_RE.exec(body))) push(m.index, '(Object.assign onto G)', 'bulk');
  return found;
};

// ── THE ANALYSIS ─────────────────────────────────────────────────────────
const analyse = (suiteSrc, legacySrc, recordSrc) => {
  const lines = suiteSrc.split(/\r?\n/);
  const code = blankNonCode(suiteSrc);
  const allow = readAllowlist(code, lines);
  const literal = readFreshKeys(legacySrc) || new Set();
  const forgotten = readServerOfRecord(recordSrc || '') || new Set();
  /* GUARANTEED PRESENT = in the fresh literal AND not deleted by the load. */
  const fresh = new Set([...literal].filter((k) => !forgotten.has(k)));
  const tests = readTests(code, lines);

  const snap1 = [], snap2 = [], snap3 = [];
  const seen1 = new Set(), seen2 = new Set(), seen3 = new Set();

  for (const t of tests) {
    const ws = writesIn(t.body, t.from);
    for (const w of ws) {
      const entry = allow.fields.get(w.field);
      if (w.how === 'bulk' || !entry) {
        const key = w.field + '@' + t.name;
        if (!seen1.has(key)) { seen1.add(key); snap1.push({ ...w, test: t.name }); }
      } else if (!entry.undefinedSafe && !fresh.has(entry.source)) {
        const key = w.field + '@' + t.name;
        if (!seen2.has(key)) {
          seen2.add(key);
          snap2.push({ ...w, test: t.name, allowLine: entry.line, allowText: entry.text });
        }
      }
      if (!t.snapshotted && w.how !== 'bulk') {
        const key = w.field + '@' + t.name;
        if (!seen3.has(key)) { seen3.add(key); snap3.push({ ...w, test: t.name }); }
      }
    }
  }
  return { allow, fresh, literal, forgotten, tests, snap1, snap2, snap3 };
};

const readTree = () => ({ suite: readFileSync(SUITE, 'utf8'), legacy: readFileSync(LEGACY, 'utf8'), record: readFileSync(RECORD, 'utf8') });

// ── PRINTING ─────────────────────────────────────────────────────────────
const rel = 'src/features/smoke-test.js';
const line = (f) => rel + ':' + f.line;

/* Grouped BY FIELD, not by writer, and sorted by blast radius. A flat list of
   545 lines is a wall nobody routes; 43 fields with their worst writers named is
   a work queue. The count IS the blast radius: every writer of one field is one
   more place the same fix has to hold. */
const group = (findings) => {
  const m = new Map();
  for (const f of findings) {
    if (!m.has(f.field)) m.set(f.field, []);
    m.get(f.field).push(f);
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
};

const printFindings = (a, verbose) => {
  console.log('snapshotG allowlist: ' + a.allow.fields.size + ' fields ('
    + rel + ':' + a.allow.start + '-' + a.allow.end + ')');
  console.log('fresh-character literal (src/legacy.js let G={…}): ' + a.literal.size + ' keys');
  console.log('SERVER_OF_RECORD (src/net/record.js — deleted off G by every load): '
    + a.forgotten.size + ' field(s)');
  console.log('  ⇒ guaranteed present on G: ' + a.fresh.size + ' key(s)');
  console.log('tests scanned: ' + a.tests.length);
  console.log('');

  const g1 = group(a.snap1);
  console.log('SNAP-1  UNLISTED — a test writes a G field snapshotG does not name.');
  console.log('        ' + a.snap1.length + ' write(s) across ' + g1.length + ' field(s).');
  for (const [field, fs] of g1) {
    const scratch = field.startsWith('_') ? '  [`_` scratch: CLAUDE.md §6 says never persisted — it still outlives restoreG within a run]' : '';
    console.log('    G.' + field + '  ×' + fs.length + scratch);
    const show = verbose ? fs : fs.slice(0, 2);
    for (const f of show) console.log('        ' + line(f) + '  [' + f.how + ']  ' + f.test);
    if (fs.length > show.length) console.log('        … +' + (fs.length - show.length) + ' more writer(s)' + (verbose ? '' : ' (--report)'));
  }
  console.log('');

  const g2 = group(a.snap2);
  console.log('SNAP-2  DROPPABLE — the allowlist entry is a BARE `f: G.f` and the fresh-character');
  console.log('        literal has no such key, so JSON.stringify drops it on a character that has');
  console.log('        never had one and restoreG puts nothing back.');
  console.log('        ' + a.snap2.length + ' write(s) across ' + g2.length + ' field(s).');
  for (const [field, fs] of g2) {
    console.log('    G.' + field + '  ×' + fs.length + '   fix: ' + rel + ':' + fs[0].allowLine
      + '  `' + fs[0].allowText + '`  →  `' + field + ': G.' + field + ' ?? null,`');
    const show = verbose ? fs : fs.slice(0, 2);
    for (const f of show) console.log('        ' + line(f) + '  ' + f.test);
    if (fs.length > show.length) console.log('        … +' + (fs.length - show.length) + ' more writer(s)' + (verbose ? '' : ' (--report)'));
  }
  console.log('');

  const g3 = group(a.snap3);
  console.log('SNAP-3  (REPORTED, NOT GATED) a test writes G and its body never takes a snapshot —');
  console.log('        ' + a.snap3.length + ' write(s) across ' + g3.length + ' field(s).');
  if (verbose) for (const [field, fs] of g3) {
    console.log('    G.' + field + '  ×' + fs.length);
    for (const f of fs) console.log('        ' + line(f) + '  ' + f.test);
  } else if (a.snap3.length) console.log('    (--report lists them)');
  console.log('');

  console.log('NOTE — the printed SNAP-2 fix is `?? null`, not `|| null`. The shipped entries use');
  console.log('       `|| null` / `|| 0`, which is correct for an object-valued field but would');
  console.log('       rewrite a legitimate `gold: 0` or `marks: 0` as null. `??` converts only');
  console.log('       undefined/null and is safe for every field on the list.');
  console.log('');
  console.log('NOTE — a test that hand-restores a field in its own `finally` is still counted.');
  console.log('       That mitigation is ONE test remembering; the allowlist is the whole suite');
  console.log('       remembering, and b252 is what happens when the next author copies the write');
  console.log('       and not the restore.');
};

// ── THE MUTATION PROOF ───────────────────────────────────────────────────
/* Two halves, and both are needed.
   REAL-TREE mutations (M1/M2) plant the exact two defects this guard exists for
   into a copy of the SHIPPED smoke-test.js, which proves the parser still finds
   the allowlist and the TESTS array in the file as it is today — the failure
   mode guard-hygiene.mjs R2 documents (a guard whose regex stopped matching
   passes forever, silently).
   SYNTHETIC fixtures (M3/M4 + controls) prove the CLEAN case is green, which the
   real tree cannot prove today: the real tree is legitimately RED (see --report).
   A guard that could only ever answer RED would be indistinguishable from one
   that is simply broken. */
const FIXTURE_LEGACY = `
let G={
  gold:0, inventory:{}, playerHp:10,playerMaxHp:10,
  settings:{sfx:true},
};
window.__FRESH_START = Object.freeze({ gold: G.gold });
`;

/* The record registry, in its two states: nothing armed, and `gold` armed — the
   second is the SHIPPED state and the reason `gold` is absent on a booted page. */
const FIXTURE_RECORD = `
export const SERVER_OF_RECORD = Object.freeze([
  Object.freeze({ field: 'dungeonScrip', from: 'dungeon_scrip' }),
]);
`;
const FIXTURE_RECORD_ARMS_GOLD = `
export const SERVER_OF_RECORD = Object.freeze([
  Object.freeze({ field: 'dungeonScrip', from: 'dungeon_scrip' }),
  Object.freeze({ field: 'gold', from: 'gold' }),
]);
`;

const fixtureSuite = (opts) => {
  const o = opts || {};
  return `
const snapshotG = () => {
  const G = window.G;
  return JSON.parse(JSON.stringify({
    gold: G.gold,
    inventory: G.inventory,
    ${o.dropAllowlisted ? '' : 'settings: G.settings,'}
    traits: G.traits${o.safeTraits ? ' || null' : ''},
  }));
};
const restoreG = (snap) => { for (const k of Object.keys(snap)) window.G[k] = snap[k]; };
const TESTS = [
  () => tryRun('FX-1: pays gold', () => {
    const snap = snapshotG();
    try { G.gold = 5; /* G.notAField = 1 is prose, not code */ } finally { restoreG(snap); }
  }),
  () => tryRun('FX-2: settings', () => {
    const snap = snapshotG();
    try { window.G.settings = { sfx: false }; } finally { restoreG(snap); }
  }),
  ${o.writesTraits ? `() => tryRun('FX-3: traits', () => {
    const snap = snapshotG();
    try { G.traits = { auto_eat: true }; } finally { restoreG(snap); }
  }),` : ''}
  ${o.plantUnlisted ? `() => tryRun('FX-4: planted', () => {
    const snap = snapshotG();
    try { G.__plantedLeak = 1; } finally { restoreG(snap); }
  }),` : ''}
];
`;
};

const selftest = () => {
  const tree = readTree();
  const results = [];
  const grade = (id, what, ok, detail) => {
    results.push({ id, what, ok, detail });
    console.log((ok ? '  ✓ ' : '  ✗ ') + id + '  ' + what + (detail ? '  — ' + detail : ''));
  };

  console.log('── SYNTHETIC FIXTURES (the clean case must be GREEN) ──');
  {
    const a = analyse(fixtureSuite({}), FIXTURE_LEGACY, FIXTURE_RECORD);
    grade('CONTROL-A', 'a clean fixture reports nothing',
      a.snap1.length === 0 && a.snap2.length === 0 && a.snap3.length === 0,
      'snap1=' + a.snap1.length + ' snap2=' + a.snap2.length + ' snap3=' + a.snap3.length);
    grade('PARSE-A', 'the fixture allowlist and tests were actually read',
      a.allow.fields.size === 4 && a.tests.length === 2,
      'allowlist=' + a.allow.fields.size + ' tests=' + a.tests.length);
  }
  {
    const a = analyse(fixtureSuite({ plantUnlisted: true }), FIXTURE_LEGACY, FIXTURE_RECORD);
    const hit = a.snap1.find((f) => f.field === '__plantedLeak');
    grade('M3', 'SNAP-1 bites an unlisted write in a fixture', !!hit,
      hit ? 'RED: G.__plantedLeak  ' + hit.test : 'NOT CAUGHT');
  }
  {
    const a = analyse(fixtureSuite({ dropAllowlisted: true }), FIXTURE_LEGACY, FIXTURE_RECORD);
    const hit = a.snap1.find((f) => f.field === 'settings');
    grade('M4', 'SNAP-1 bites when an allowlist entry a test writes is REMOVED', !!hit,
      hit ? 'RED: G.settings  ' + hit.test : 'NOT CAUGHT');
  }
  {
    const bare = analyse(fixtureSuite({ writesTraits: true }), FIXTURE_LEGACY, FIXTURE_RECORD);
    const safe = analyse(fixtureSuite({ writesTraits: true, safeTraits: true }), FIXTURE_LEGACY, FIXTURE_RECORD);
    const bit = bare.snap2.some((f) => f.field === 'traits');
    const cleared = !safe.snap2.some((f) => f.field === 'traits');
    grade('M5', 'SNAP-2 bites a BARE entry for a field the fresh literal lacks', bit,
      bit ? 'RED: G.traits' : 'NOT CAUGHT');
    grade('CONTROL-B', '…and `|| null` on the same entry clears it', cleared,
      cleared ? 'green' : 'still red — the rule is not reading the operator');
  }
  {
    const a = analyse(fixtureSuite({ plantUnlisted: true }), FIXTURE_LEGACY, FIXTURE_RECORD);
    grade('CONTROL-C', 'a `G.x =` inside a /* comment */ is NOT counted as a write',
      !a.snap1.some((f) => f.field === 'notAField'),
      a.snap1.some((f) => f.field === 'notAField') ? 'comment counted as code' : 'blanked');
  }
  {
    /* THE MEASURED `gold` CASE, as a mutation. The fixture's `gold` is in the
       fresh literal and FX-1 writes it, so with nothing armed it is clean
       (CONTROL-A above). ARM it on SERVER_OF_RECORD — which is the shipped
       state — and the load deletes it off G, the bare entry snapshots nothing,
       and SNAP-2 must say so. If this arm ever goes quiet, the guard has
       stopped reading src/net/record.js and SNAP-2 is a third of its size
       without anybody noticing. */
    const a = analyse(fixtureSuite({}), FIXTURE_LEGACY, FIXTURE_RECORD_ARMS_GOLD);
    const hit = a.snap2.find((f) => f.field === 'gold');
    grade('M6', 'SNAP-2 bites a literal field the load DELETES (SERVER_OF_RECORD)', !!hit,
      hit ? 'RED: G.gold  ' + hit.test : 'NOT CAUGHT — record.js is not being read');
  }

  console.log('');
  console.log('── THE SHIPPED TREE (the parser must still find the real file) ──');
  {
    const a = analyse(tree.suite, tree.legacy, tree.record);
    grade('PARSE-B', 'snapshotG allowlist found in the shipped suite', a.allow.fields.size >= 40,
      a.allow.fields.size + ' fields at ' + rel + ':' + a.allow.start);
    grade('PARSE-C', 'the TESTS array was segmented', a.tests.length >= 900, a.tests.length + ' tests');
    grade('PARSE-D', 'the fresh-character literal was read from src/legacy.js', a.literal.size >= 25,
      a.literal.size + ' keys');
    grade('PARSE-F', 'SERVER_OF_RECORD was read from src/net/record.js and subtracted',
      a.forgotten.size >= 8 && a.forgotten.has('gold') && a.fresh.size === a.literal.size - [...a.forgotten].filter((k) => a.literal.has(k)).length,
      a.forgotten.size + ' armed field(s); guaranteed-present = ' + a.fresh.size);
    grade('PARSE-E', 'real G writes were found inside test bodies',
      a.snap1.length + a.snap2.length + a.snap3.length > 0,
      'snap1=' + a.snap1.length + ' snap2=' + a.snap2.length + ' snap3=' + a.snap3.length);
  }
  {
    // M1 — plant the b252 defect verbatim into a copy of the real file.
    const t = readTests(blankNonCode(tree.suite), tree.suite.split(/\r?\n/));
    const victim = t.find((x) => x.snapshotted) || t[0];
    const ls = tree.suite.split(/\r?\n/);
    ls.splice(victim.line, 0, "    G.__qaPlantedLeak = { kind: 'cook' };");
    const a = analyse(ls.join('\n'), tree.legacy);
    const hit = a.snap1.find((f) => f.field === '__qaPlantedLeak');
    grade('M1', 'SNAP-1 bites a planted unlisted write in the SHIPPED suite', !!hit,
      hit ? 'RED: G.__qaPlantedLeak  ' + line(hit) + '  ' + hit.test : 'NOT CAUGHT');
  }
  {
    // M2 — remove a real allowlist entry that real tests write.
    const base = analyse(tree.suite, tree.legacy, tree.record);
    const entry = base.allow.fields.get('gold');
    if (!entry) { grade('M2', 'the `gold` allowlist entry exists to remove', false, 'not found'); }
    else {
      const ls = tree.suite.split(/\r?\n/);
      ls[entry.line - 1] = ls[entry.line - 1].replace(/\bgold\s*:\s*G\.gold\s*,?/, '');
      const a = analyse(ls.join('\n'), tree.legacy);
      const hit = a.snap1.find((f) => f.field === 'gold');
      const wasClean = !base.snap1.some((f) => f.field === 'gold');
      grade('M2', 'SNAP-1 bites when the real `gold` entry is REMOVED', !!hit && wasClean,
        hit ? 'RED: G.gold  ' + line(hit) + '  ' + hit.test : 'NOT CAUGHT');
    }
  }

  const bad = results.filter((r) => !r.ok);
  console.log('');
  console.log(bad.length ? '✗ selftest: ' + bad.length + '/' + results.length + ' mutation(s) NOT caught'
    : '✓ selftest: ' + results.length + '/' + results.length + ' — every mutation caught, every control green');
  return bad.length ? 1 : 0;
};

// ── MAIN ─────────────────────────────────────────────────────────────────
if (SELFTEST) {
  process.exit(selftest());
} else {
  const tree = readTree();
  const a = analyse(tree.suite, tree.legacy, tree.record);
  const gated = a.snap1.length + a.snap2.length;
  if (AS_JSON) {
    /* stdout is JSON AND NOTHING ELSE — the exit code still carries the verdict.
       (It printed the human summary after the JSON on its first draft, which
       makes `--json | jq` fail on a red tree, i.e. exactly when it is wanted.) */
    console.log(JSON.stringify({
      allowlist: [...a.allow.fields.keys()],
      freshKeys: [...a.fresh],
      tests: a.tests.length,
      snap1: a.snap1, snap2: a.snap2, snap3: a.snap3,
    }, null, 2));
    process.exit(gated ? 1 : 0);
  }
  printFindings(a, REPORT);
  if (REPORT) {
    console.log('');
    console.log('--report: informational, exit 0. ' + gated + ' gated finding(s); '
      + a.snap3.length + ' SNAP-3 note(s).');
    process.exit(0);
  }
  if (gated) {
    console.log('');
    console.log('✗ snapshot-allowlist-guard: ' + gated + ' finding(s). '
      + 'Every one is a `G` write a later test inherits. Fix the WRITER or the ALLOWLIST — '
      + 'never this guard.');
    process.exit(1);
  }
  console.log('✓ snapshot-allowlist-guard: every G write a test performs is restored.');
  process.exit(0);
}
