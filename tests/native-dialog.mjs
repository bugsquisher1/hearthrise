// ============================================================================
// tests/native-dialog.mjs — NO NATIVE BLOCKING DIALOG MAY EXIST UNDER src/.
//
// window.confirm / window.prompt / window.alert BLOCK THE RENDERER'S MAIN
// THREAD until they are answered. Nothing in Hearthrise runs while one is up —
// no tick, no autosave, no paint, no input, no network callback — and one that
// is never answered (suppressed by Chrome after a repeat, raised while the tab
// is not frontmost, buried behind an OS window, or driven under automation)
// blocks it forever, with no recovery available to the page.
//
// TWICE SHIPPED, TWICE A HARD FREEZE:
//   • b371 — hero-slot switch used confirm(). 3/3 repro in live play, 60s+
//     renderer hang, manual reload the only way out. tests/slot-switch.mjs
//     pinned that ONE file.
//   • b373 — the character RENAME pencil used prompt(). Found in the b372 FTUE
//     run: "the renderer blocked hard (all CDP evaluate/screenshot timed out)
//     until the tab was closed." A file-scoped guard could not see it, because
//     it lived in a different file.
//
// So this guard is the generalisation the second incident argued for: a STATIC
// SCAN of every shipped source file under src/, with an explicit allowlist that
// must carry a REASON. The scan is the cheap, total one; tests/slot-switch.mjs
// keeps the expensive behavioural proof (a real freeze, measured out of
// process) for the path that caused the first incident.
//
// WHY STATIC AND NOT RUNTIME: a runtime dialog listener only sees the dialogs a
// harness happens to trigger. The rename prompt sat one click away from the
// most-visited screen in the game and no in-page test ever reached it. Source
// text sees all of them, including the one nobody thought to click.
//
// WHAT IS NOT A FINDING
//   • Comments. Every one of these files EXPLAINS the incident by name, and a
//     guard that fired on its own documentation teaches the next author to
//     delete the explanation instead of the call. Comments are stripped first.
//   • Method calls on an object — `deferredPrompt.prompt()` (the browser's
//     BeforeInstallPromptEvent, the only way to install the PWA),
//     `D.confirm(...)`, `dialog.alert(...)`. Only a BARE call or an explicit
//     `window.` prefix is the global.
//   • `HearthriseDialog`'s own API surface — its methods are named confirm /
//     prompt / alert on purpose, so callers read the same at every site.
//
// MUTATION (`--mutate`): a native call site is injected into the scanned text
// and the guard must go RED. Without that, "no matches" also passes against a
// scan whose regex silently stopped matching anything.
// ============================================================================

import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/* A bare `confirm(`/`prompt(`/`alert(` or an explicit `window.`-prefixed one.
   `[^.\w$]` before the name rejects `x.confirm(` and `myConfirm(` alike; the
   `window\.` alternative catches the explicit global. */
const NATIVE_CALL = /(?:^|[^.\w$])(?:window\s*\.\s*)?(confirm|prompt|alert)\s*\(/g;

/* ── THE ALLOWLIST ────────────────────────────────────────────────────────
   Every entry needs a REASON, and the reason has to survive being read aloud
   in review. `where` is a repo-relative path (POSIX separators); `match` is a
   regex that must match the ~80 characters of context around the call. An
   entry that stops matching anything is itself reported — a stale exemption is
   how a ban rots into a suggestion. */
const ALLOW = [
  /* EMPTY, AND THAT IS THE FINDING: as of b373 every native dialog under src/
     is converted, so nothing needs excusing. The mechanism stays because the
     honest answer to a future exemption is a documented one, not a deleted
     guard — but an entry has to earn its place, and "it's only a dev tool" is
     not a reason (admin.js's save-wipe confirm was converted for exactly that
     argument: a native call site is one the next author copies).

     Two things that look like they need entries and do NOT:
       • src/utils/dialog.js — its methods are NAMED confirm/prompt/alert so
         call sites read naturally, but they are declared as
         confirmDialog/promptDialog/alertDialog and only ever referenced as
         object properties. It gets its own stricter assertions below.
       • the b214 XSS payload `<img src=x onerror=alert(1)>` in the smoke suite
         — a string literal, and string literals are stripped before scanning. */
];

const SKIP_DIRS = new Set(['node_modules', '.git']);

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

/* Strip comments AND string literals before scanning.
   Both are required, and the second was learned the hard way in this very
   commit: the first run of this guard reported SEVEN findings, all of them the
   words "confirm()" and "prompt()" inside the ASSERTION MESSAGES of the tests
   written to ban them. A guard that fires on the sentence explaining the rule
   is a guard the next author deletes. Strings can only produce false POSITIVES
   here (a native call is a call, not a quoted word), so removing them is
   strictly a precision gain — and it is what makes the XSS-payload literal
   `<img src=x onerror=alert(1)>` in the suite a non-event rather than a
   standing exemption.

   Naive about a `//` or a quote inside the other kind of literal. That can only
   make the scan MISS something, never invent it, and the --mutate control is
   what keeps "it still matches" honest. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    /* Template literals keep their ${…} EXPRESSIONS — those are real code and a
       native call can live in one. Only the literal text between them goes. */
    .replace(/`(?:\\.|[^`\\])*`/g, (lit) => lit.replace(/\$\{[\s\S]*?\}|[\s\S]/g,
      (t) => (t.startsWith('${') ? t : ' ')));
}

export async function nativeDialogGuard(root, opts = {}) {
  const problems = [];
  const srcDir = join(root, 'src');
  const files = await walk(srcDir);
  if (files.length < 50) {
    problems.push(`only ${files.length} source files were scanned — the walk is broken and this guard proves nothing`);
    return problems;
  }

  const used = new Set();
  let scannedCalls = 0;

  for (const file of files) {
    const rel = relative(root, file).split(sep).join('/');
    let src = await readFile(file, 'utf8');
    if (opts.mutate && rel === 'src/legacy.js') {
      /* THE CONTROL: the pre-b373 rename, restored in shape. */
      src += '\nfunction __mutantRename(){ var n = prompt("Display name:", "Adventurer"); return n; }\n';
    }
    const code = stripComments(src);
    NATIVE_CALL.lastIndex = 0;
    let m;
    while ((m = NATIVE_CALL.exec(code)) !== null) {
      scannedCalls++;
      const context = code.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ');
      const hit = ALLOW.find((a) => a.where === rel && a.match.test(context));
      if (hit) { used.add(hit); continue; }
      const line = code.slice(0, m.index).split('\n').length;
      problems.push(`${rel}:${line} calls native ${m[1]}() — "${context.trim()}". A native dialog BLOCKS the `
        + 'renderer main thread until answered and has hard-frozen shipped builds twice (b371 slot switch, '
        + 'b373 rename). Ask with window.HearthriseDialog.confirm/prompt/alert (src/utils/dialog.js), or add '
        + 'an allowlist entry with a reason to tests/native-dialog.mjs.');
    }
  }

  /* The replacement service must not quietly grow a native fallback: that is
     the failure mode where the ban holds everywhere except the one path that
     runs when things are already going wrong. */
  const dialogSrc = stripComments(await readFile(join(srcDir, 'utils', 'dialog.js'), 'utf8'));
  if (/(?:^|[^.\w$])window\s*\.\s*(confirm|prompt|alert)\s*\(/.test(dialogSrc)) {
    problems.push('src/utils/dialog.js calls a NATIVE dialog itself — the replacement cannot fall back to the '
      + 'thing it replaces');
  }
  if (!/HearthriseDialog/.test(dialogSrc)) {
    problems.push('src/utils/dialog.js no longer publishes window.HearthriseDialog — every converted call site '
      + 'silently degrades to "do nothing"');
  }

  /* A stale exemption is a hole with a comment on it. */
  for (const a of ALLOW) {
    if (!used.has(a) && !opts.mutate) {
      problems.push(`the allowlist entry for ${a.where} (${a.match}) matched nothing — the code it excused is `
        + 'gone, so delete the entry rather than leaving a standing exemption');
    }
  }

  if (opts.mutate) {
    const caught = problems.some((p) => /src\/legacy\.js:\d+ calls native prompt/.test(p));
    if (caught) console.log('   [mutation caught] the injected prompt() call site was reported');
    return caught ? []
      : ['MUTATION SURVIVED: a native prompt() call site was injected into src/legacy.js and this scan did not '
         + 'report it. The regex is not matching anything.'];
  }

  /* THE VACUITY CONTROL. With every call site converted the expected number of
     findings is ZERO, and "zero" is also what a broken regex, a broken walk and
     an over-eager stripper all produce. So the scanner is run against a fixture
     that MUST match — including the shapes this file deliberately does not
     count, which must NOT. If this ever disagrees, the silence above means
     nothing. `scannedCalls` is reported for the same reason. */
  const fixture = stripComments([
    'function a(){ if(confirm("x")) return 1; }',            // bare -> must match
    'function b(){ return window.prompt("y"); }',            // explicit global -> must match
    'function c(){ return deferredPrompt.prompt(); }',       // method -> must NOT
    'function d(){ return D.confirm({}); }',                 // method -> must NOT
    'function e(){ var s = "call confirm() here"; }',        // string -> must NOT
    '/* confirm( in a comment */',                           // comment -> must NOT
  ].join('\n'));
  NATIVE_CALL.lastIndex = 0;
  const found = [...fixture.matchAll(NATIVE_CALL)].map((m) => m[1]);
  if (found.length !== 2 || found[0] !== 'confirm' || found[1] !== 'prompt') {
    problems.push('SELF-TEST FAILED: the scanner found ' + JSON.stringify(found) + ' in a fixture that contains '
      + 'exactly one bare confirm() and one window.prompt() (plus a method call, a string and a comment that '
      + 'must not count). Every "no findings" verdict above is therefore worthless.');
  }
  if (!opts.quiet) {
    console.log(`   (scanned ${files.length} files under src/, ${scannedCalls} candidate token(s))`);
  }
  return problems;
}

export default nativeDialogGuard;

/* Standalone:
     node tests/native-dialog.mjs            (expect green)
     node tests/native-dialog.mjs --mutate   (expect green — the mutant died) */
if (process.argv[1]?.endsWith('native-dialog.mjs')) {
  const { fileURLToPath } = await import('node:url');
  const { normalize } = await import('node:path');
  const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const mutate = process.argv.includes('--mutate');
  const problems = await nativeDialogGuard(ROOT, { mutate });
  if (problems.length) {
    console.log(`Native-dialog guard${mutate ? ' (MUTATION)' : ''} — FAILED:`);
    for (const p of problems) console.log('  ✗ ' + p);
    process.exit(1);
  }
  console.log(`Native-dialog guard${mutate ? ' (MUTATION — the injected prompt() was caught)' : ''} — green.`);
}
