// ============================================================================
// tests/no-client-xp-mint.mjs — THE CLIENT MAY NOT AUTHOR XP.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// CLAUDE.md §1: "the client never computes an authoritative number: XP, levels,
// combat outcomes, yields, drops, gold … are all computed and owned by the
// server. Client prediction is display-only and always reconciled to the
// envelope."
//
// b521 found a 256-build-old violation of exactly that line. `buryBones()` in
// src/legacy.js was `removeItem(id,n)` + `addXp('prayer', it.buryXp*n)` with no
// intent, no RPC and no settle. paione, 2026-09-07: "I got like 2k bones which
// I can bury a gazillion times and get the exp and keep the bones." He was
// right — a reload restored the bones and snapped Prayer back to the server's
// number, because the realm had never been told a burial happened.
//
// The lesson is not "burying was wrong". It is that `addXp(` is the ONE call in
// this codebase that can quietly re-open §1, it appears in prose and in seam
// objects as well as in real calls, and nothing counted it. A grep is not a
// verdict: most call sites are legitimate, so the useful question is not
// "does addXp appear?" but "does it appear anywhere NEW".
//
// ── THE THREE CLASSES (the census this guard maintains) ─────────────────────
//   (a) PREDICTION, RECONCILED — a DECLARED, server-settled activity's live
//       tick. The client draws the bar moving; the settle assigns the server's
//       absolute number over it (src/net/accrue.js applyEnvelopeState, gated by
//       serverAccruedSkill() in src/data/skill-authority.js). Combat, gather and
//       the payable artisan benches.
//   (b) APPLYING A SERVER-CREDITED VALUE — the number came back IN a response
//       and is copied into the cache exactly once (hr_farm_* via
//       reconcileFarmResult, a claimed goal/quest reward the server catalogued).
//   (c) CLIENT-AUTHORED — nobody server-side knows this happened. This is the
//       bug class. buryBones() was the last one with a live call site.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//   XP-1  RATCHET. The number of `addXp(` CALL SITES outside the allowlist may
//         only fall. Baseline below; a new site is a review, not a merge.
//   XP-2  THE ALLOWLIST IS NOT VACUOUS. Every (file, function) entry must still
//         resolve to at least one real call site. An allowlist entry that has
//         stopped matching is silently widening the ratchet, so it is a failure.
//   XP-3  NO DIRECT SKILL WRITE. `G.skills.<id> =` / `G.skills[…] =` outside
//         the progression seam is `addXp` with the guard filed off — the exact
//         shape three of the four bury surfaces used as their fallback.
//   XP-4  THE CONTROL (--selftest). A planted `addXp('prayer', 5)` must go red,
//         a planted `G.skills.prayer =` must go red, an allowlist entry that
//         matches nothing must go red, and prose/strings naming addXp must NOT.
//
// ── WHAT IT DELIBERATELY DOES NOT ASSERT ────────────────────────────────────
// It does not try to decide (a) vs (b) automatically. Both are legitimate and
// telling them apart needs the callee's settlement rules, not a regex — that
// judgement lives in the ALLOWLIST comments below, one line per entry, written
// by whoever added it. What this file guarantees is that the judgement was MADE.
//
// src/features/smoke-test.js is excluded: it is the suite, it drives addXp on
// purpose to assert on it, and counting it would make the ratchet a measure of
// how much we test. src/core/** is excluded because it has no addXp at all —
// it takes an `fx.addXp` seam from its caller (that indirection is the reason
// the seam SHAPES below are not counted as call sites).
//
// Usage:  node tests/no-client-xp-mint.mjs [--selftest] [--list]
// Exit:   0 green · 1 the ratchet moved the wrong way · 2 harness
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* ── THE RATCHET ────────────────────────────────────────────────────────────
   Call sites outside the allowlist. MEASURED 2026-09-07 after b521 removed the
   bury mint. It may FALL — pay one down and lower this number in the same
   commit. It may not rise: a new client-authored XP grant is a §1 violation and
   needs the review, not a bumped constant. */
export const MAX_UNCLASSIFIED_SITES = 0;

/* ── THE ALLOWLIST ──────────────────────────────────────────────────────────
   (file, enclosing function, class, why). The `why` is the whole value of this
   file: it is where the (a)/(b) judgement is written down. Every entry must
   still match at least one real call site (XP-2) — an entry that has gone stale
   is widening the ratchet in silence. */
export const ALLOWED = [
  // ── (a) PREDICTION, RECONCILED TO THE ENVELOPE ────────────────────────────
  ['src/legacy.js', 'doArtisanAction', '(a)',
    'the LIVE tick of a DECLARED artisan run (startArtisan → declareActivity("artisan", recipeId)). '
    + 'Prayer/smithing/crafting/runecrafting/stonemason/cooking are payable lanes '
    + '(ARTISAN_SETTLEMENT), so serverAccruedSkill() lets the settle assign the server number '
    + 'ABSOLUTELY over this prediction — including downward. Three sites: the base definition and '
    + 'the two branches of the inputs-aware override (burnt / normal).'],

  // ── (b) APPLYING A SERVER-CREDITED VALUE ──────────────────────────────────
  ['src/net/farm-sync.js', 'reconcileFarmResult', '(b)',
    'copies plant_xp / water_xp / xp out of the hr_farm_* RESPONSE exactly once. '
    + 'Proven by tests/farm-sync.mjs; the gesture half is proven by tests/no-client-farm-mint.mjs.'],
  ['src/legacy.js', 'completeQuest', '(b)',
    'a quest payout the server catalogued (hrQuestItemsAreServerCredited + hrFireQuestClaim → '
    + 'HearthriseGoalClaim.claimQuest). Routed through killXpRoute so it splits like a kill; '
    + '{authored:true} keeps PACE.xp off a number the Designer wrote. tests/quest-reward-parity.mjs '
    + 'binds data, client and server catalogue together.'],
  ['src/legacy.js', 'claimQuestReward', '(b)',
    'the daily/weekly goal claim. The server verdict (hr_claim_goal) is taken FIRST and this branch '
    + 'only runs for a reward it accepted; an uncataloguable goal carries `blocked:` and is never '
    + 'dealt (tests/modal-goal-claim.mjs binds the two).'],
  ['src/features/muster.js', 'payChest', '(b)',
    'the Muster claim response. Items are gated on the inventory record seam; the XP rides the same '
    + 'claim the server answered.'],
];

/* ── XP-3's OWN RATCHET ─────────────────────────────────────────────────────
   A direct `G.skills.<id> =` is addXp() with the guard filed off: it skips the
   record seam, PACE, the level-up route and the prediction bookkeeping. Three
   exist and none is a GRANT; each is named here with its disposition so the
   fourth is loud. This list is a debt register, not an endorsement. */
export const DIRECT_ALLOWED = [
  ['src/admin.js', 'setSkillLevel',
    'the admin console\'s Set Level. A LOCAL display write on a dev surface: prayer/attack/etc. are '
    + 'serverAccruedSkill(), so the next envelope assigns the server number back over it ABSOLUTELY '
    + '— it cannot become progression. DEBT: it should call a server RPC or nothing at all.'],
  ['src/legacy.js', 'testerBoost',
    'the tester cheat button, same shape and the same fate: overwritten by the next settle. '
    + 'DEBT: it predates the cutover and wants deleting with the rest of the dev surface.'],
  ['src/legacy.js', 'migrate',
    'NOT A GRANT — `if(typeof G.skills.ranged !== "number") G.skills.ranged = 0` initialises an '
    + 'absent key so the style normaliser has a number to read. It writes 0, never a gain. The '
    + 'in-place comment already books the follow-up: route raw G.skills reads through '
    + 'src/net/skill-record.js, THEN gate this on clientMayWriteRecordField("skills").'],
];

/* Files/dirs never scanned, each with the reason (see the header). */
export const EXCLUDED = [
  'src/features/smoke-test.js',   // the suite drives addXp to assert on it
  'src/core/',                    // pure, dual-runtime; takes an fx.addXp seam
];

/* A `addXp:` / `addXp =` PROPERTY, not a call: the injection seam a core module
   is handed. The caller's own call site is what gets classified, so counting
   these too would double-count one decision. */
const SEAM_SHAPE = /\baddXp\s*[:=]\s*(?:async\s*)?function\b/;

/* `function addXp(` is the DECLARATION, not a call. Excluded by shape rather
   than by an allowlist entry so that renaming or moving the definition can
   never read as a new mint. */
const DECLARATION = /\bfunction\s+$/;

/* A direct write to the XP ledger — addXp with the guard filed off (XP-3). */
const DIRECT_SKILL_WRITE = /\bG\.skills(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])\s*(?:\+=|=(?!=))/;

/** Strip comments and quoted/template strings so prose and copy never count. */
export function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1 + m.slice(p1.length).replace(/./g, ' '))
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/'(?:\\.|[^'\\\n])*'/g, (m) => "'" + ' '.repeat(Math.max(0, m.length - 2)) + "'")
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');
}

/**
 * The innermost NAMED enclosing function for each target index, in ONE linear
 * pass. (Brace-matching from every declaration is O(n) per function and this
 * file scans a 1 MB monolith with ~1,500 of them.)
 *
 * A `{` pushes either the name of the function it opens or null (a block, an
 * object literal, a class body). A `}` pops. The innermost non-null entry on
 * the stack at the target index is the answer; `<top>` means module scope.
 */
export function enclosingFns(code, targets) {
  const NAME_BEFORE = new RegExp(
    '(?:function\\s+([A-Za-z_$][\\w$]*)\\s*\\([^()]*\\)\\s*$)'
    + '|(?:([A-Za-z_$][\\w$.]*)\\s*[:=]\\s*(?:async\\s+)?function\\s*(?:[A-Za-z_$][\\w$]*)?\\s*\\([^()]*\\)\\s*$)'
    + '|(?:([A-Za-z_$][\\w$.]*)\\s*[:=]\\s*(?:async\\s*)?(?:\\([^()]*\\)|[A-Za-z_$][\\w$]*)\\s*=>\\s*$)'
  );
  const sorted = targets.slice().sort((a, b) => a - b);
  const out = new Map();
  const stack = [];
  let ti = 0;
  for (let i = 0; i < code.length && ti < sorted.length; i++) {
    while (ti < sorted.length && sorted[ti] <= i) {
      const named = stack.filter(Boolean);
      out.set(sorted[ti], named.length ? named[named.length - 1] : '<top>');
      ti++;
    }
    const c = code[i];
    if (c === '{') {
      const m = NAME_BEFORE.exec(code.slice(Math.max(0, i - 240), i));
      stack.push(m ? (m[1] || m[2] || m[3]).replace(/^window\./, '') : null);
    } else if (c === '}') {
      stack.pop();
    }
  }
  while (ti < sorted.length) {
    const named = stack.filter(Boolean);
    out.set(sorted[ti], named.length ? named[named.length - 1] : '<top>');
    ti++;
  }
  return out;
}

/** Every real `addXp(` CALL in one file, with its enclosing function and line. */
export function sitesIn(file, src) {
  const code = codeOnly(src);
  const targets = [];
  const re = /\baddXp\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const lineStart = code.lastIndexOf('\n', m.index) + 1;
    let lineEnd = code.indexOf('\n', m.index);
    if (lineEnd < 0) lineEnd = code.length;
    if (SEAM_SHAPE.test(code.slice(lineStart, lineEnd))) continue;   // an fx/deps seam
    if (DECLARATION.test(code.slice(Math.max(0, m.index - 20), m.index))) continue;  // the definition
    targets.push(m.index);
  }
  const fns = enclosingFns(code, targets);
  return targets.map((idx) => ({
    file,
    fn: fns.get(idx) || '<top>',
    line: code.slice(0, idx).split('\n').length,
    text: src.split('\n')[code.slice(0, idx).split('\n').length - 1].trim().slice(0, 120),
  }));
}

/** Direct `G.skills.x =` writes outside the progression seam (XP-3). */
export function directWritesIn(file, src) {
  const code = codeOnly(src);
  const lines = code.split('\n');
  const rawLines = src.split('\n');
  const targets = [];
  let at = 0;
  lines.forEach((ln, i) => {
    const m = DIRECT_SKILL_WRITE.exec(ln);
    if (m) targets.push({ idx: at + m.index, line: i + 1 });
    at += ln.length + 1;
  });
  const fns = enclosingFns(code, targets.map((t) => t.idx));
  return targets.map((t) => ({
    file, line: t.line, fn: fns.get(t.idx) || '<top>',
    text: (rawLines[t.line - 1] || '').trim().slice(0, 120),
  }));
}

export function audit(sources) {
  const sites = [];
  const writes = [];
  for (const [file, src] of Object.entries(sources)) {
    sites.push(...sitesIn(file, src));
    writes.push(...directWritesIn(file, src));
  }
  const allowed = ALLOWED.map(([f, fn, cls, why]) => ({ f, fn, cls, why, hits: 0 }));
  const unclassified = [];
  for (const s of sites) {
    const a = allowed.find((x) => x.f === s.file && x.fn === s.fn);
    if (a) { a.hits++; continue; }
    unclassified.push(s);
  }
  const writesAllowed = DIRECT_ALLOWED.map(([f, fn, why]) => ({ f, fn, why, hits: 0 }));
  const direct = [];
  for (const w of writes) {
    const a = writesAllowed.find((x) => x.f === w.file && x.fn === w.fn);
    if (a) { a.hits++; continue; }
    direct.push(w);
  }
  const stale = allowed.filter((a) => a.hits === 0)
    .concat(writesAllowed.filter((a) => a.hits === 0));
  return { sites, unclassified, stale, writes, direct, allowed: allowed.concat(writesAllowed) };
}

/* ── the real tree ─────────────────────────────────────────────────────────── */
function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const rel = relative(ROOT, p).split(sep).join('/');
    if (EXCLUDED.some((x) => rel === x || rel.startsWith(x))) continue;
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out[rel] = readFileSync(p, 'utf8');
  }
  return out;
}
export function loadSrc() { return walk(join(ROOT, 'src'), {}); }

// ── XP-4 THE CONTROL ────────────────────────────────────────────────────────
function selftest() {
  let bad = 0;
  const check = (what, ok, extra) => {
    console.log(`  ${ok ? '✓' : '✗'} ${what}`);
    if (!ok) { bad++; if (extra) console.log('      ' + extra); }
  };

  // The bug itself, planted back in.
  {
    const src = { 'fake.js': "function buryBones(id,n){\n  removeItem(id,n);\n  addXp('prayer', 5);\n}\n" };
    const { unclassified } = audit(src);
    check('bites: a planted client-authored addXp(\'prayer\', 5)',
      unclassified.length === 1 && unclassified[0].fn === 'buryBones',
      JSON.stringify(unclassified));
  }
  // …and at module scope, where there is no function to name.
  {
    const { unclassified } = audit({ 'fake.js': "addXp('prayer', 5);\n" });
    check('bites: a mint at module scope', unclassified.length === 1 && unclassified[0].fn === '<top>',
      JSON.stringify(unclassified));
  }
  // …and inside a nested callback, which is where they actually hide.
  {
    const src = { 'fake.js': "function claimAll(){\n  rows.forEach(function(r){\n    if(r.xp) addXp(r.skill, r.xp);\n  });\n}\n" };
    const { unclassified } = audit(src);
    check('bites: a mint nested in an anonymous callback (named by its owner)',
      unclassified.length === 1 && unclassified[0].fn === 'claimAll', JSON.stringify(unclassified));
  }
  // XP-3.
  {
    const { direct } = audit({ 'fake.js': "function bury(id){ G.skills.prayer = (G.skills.prayer||0) + 4.5; }\n" });
    check('bites: a direct G.skills.<id> = write (addXp with the guard filed off)', direct.length === 1,
      JSON.stringify(direct));
  }
  {
    const { direct } = audit({ 'fake.js': "function bury(id){ G.skills[sk] += amt; }\n" });
    check('bites: a direct G.skills[sk] += write', direct.length === 1, JSON.stringify(direct));
  }
  // The negative controls: prose, copy and seams are not calls.
  {
    const src = {
      'fake.js': "/* the old body called addXp('prayer', it.buryXp*n) and set G.skills.prayer = 0 */\n"
        + "// see addXp() in legacy.js\n"
        + "var msg = \"addXp('prayer', 5)\";\n"
        + "var t = `G.skills.prayer = ${x}`;\n"
        + "var fx = { addXp:function(sk,amt){ addXp(sk,amt); } };\n",
    };
    const { unclassified, direct } = audit(src);
    check('passes: addXp named in a comment, a string, a template and a SEAM property',
      unclassified.length === 0 && direct.length === 0,
      JSON.stringify(unclassified) + ' | ' + JSON.stringify(direct));
  }
  // XP-2: a stale allowlist entry is a failure, not a free pass.
  {
    const { stale } = audit({ 'src/net/farm-sync.js': '// nothing here any more\n' });
    check('bites: an allowlist entry that has stopped matching (XP-2)',
      stale.some((s) => s.f === 'src/net/farm-sync.js'), JSON.stringify(stale.map((s) => s.f + ' ' + s.fn)));
  }
  // The vacuity controls: the REAL tree must actually be read, by BOTH scans.
  {
    const { sites, writes } = audit(loadSrc());
    check(`not vacuous: ${sites.length} real addXp call site(s) located in src/`, sites.length >= 5);
    check(`not vacuous: ${writes.length} real G.skills write(s) located in src/`, writes.length >= 3);
  }

  if (bad) { console.error(`no-client-xp-mint --selftest: ${bad} control(s) failed.`); process.exit(1); }
  console.log('no-client-xp-mint --selftest: all controls green.');
  process.exit(0);
}

const argv = process.argv.slice(2);
const isMain = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  if (argv.includes('--selftest')) selftest();
  const { sites, unclassified, stale, direct, writes } = audit(loadSrc());
  if (argv.includes('--list')) {
    for (const s of sites) console.log(`${s.file}:${s.line}  ${s.fn}()  ${s.text}`);
    console.log(`\n${sites.length} call site(s); ${sites.length - unclassified.length} allowlisted, `
      + `${unclassified.length} unclassified.`);
    process.exit(0);
  }
  const problems = [];
  if (unclassified.length > MAX_UNCLASSIFIED_SITES) {
    for (const s of unclassified) {
      problems.push(`XP-1 ${s.file}:${s.line} ${s.fn}(): addXp( outside the allowlist. Either this is a `
        + 'prediction for a DECLARED, server-settled activity (or applies a value the server returned) '
        + `— add it to ALLOWED with the reason — or it is a §1 violation: route the gesture to the `
        + `intent that owns it. Source: ${s.text}`);
    }
  }
  for (const s of stale) {
    problems.push(`XP-2 ALLOWED entry ${s.f} ${s.fn}() matches nothing. It was renamed or removed, and a `
      + 'stale entry widens the ratchet in silence. Re-point it or delete it.');
  }
  for (const d of direct) {
    problems.push(`XP-3 ${d.file}:${d.line}: a direct G.skills write — addXp() with the guard filed off. `
      + `It bypasses the record seam, PACE, the level-up route and the reconcile. Source: ${d.text}`);
  }
  if (problems.length) {
    console.error(`no-client-xp-mint — ${problems.length} problem(s):`);
    for (const p of problems) console.error('  ✗ ' + p);
    console.error(`\n  (${sites.length} addXp call sites in src/, ratchet allows `
      + `${MAX_UNCLASSIFIED_SITES} unclassified, found ${unclassified.length}.)`);
    process.exit(1);
  }
  console.log(`no-client-xp-mint — ${sites.length} addXp call site(s) in src/ across `
    + `${ALLOWED.length} classified path(s); ${unclassified.length}/${MAX_UNCLASSIFIED_SITES} `
    + `unclassified. ${writes.length} direct G.skills write(s), all ${DIRECT_ALLOWED.length} named. `
    + 'The client predicts and applies; it authors nothing.');
  process.exit(0);
}
