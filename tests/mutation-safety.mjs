// ════════════════════════════════════════════════════════════════════════
// tests/mutation-safety.mjs — A MUTATION HARNESS MAY NOT LEAVE PRODUCTION
// CODE MUTATED. Ever. Not on a throw, not on Ctrl-C, not on a kill.
//
// ── THE INCIDENT THIS EXISTS FOR (2026-08-16, found by Security) ────────
// `tests/artisan-accrual.mjs --selftest` plants M1 — it replaces
// `bag[id] = have - take;` in supabase/functions/hr-accrue/accrual.js with a
// comment, i.e. THE ARTISAN SIMULATION STOPS DEBITING ITS INPUTS. That is an
// item-duplication bug in the live accrual engine. The restore was the
// statement after the probe runs, on the happy path, with no `finally` and no
// signal handler. The run was killed by a harness timeout partway through, the
// restore never executed, and the mutation sat in the working tree as a real
// diff — `/* MUTATED */` on line 1709 of the deployed engine — until a reviewer
// read the diff and found it.
//
// It was two keystrokes away from being committed and deployed. A test harness
// that can leave production code broken when it is interrupted is not a test
// harness with a bug; it is a defect with a test harness attached.
//
// ── THE THREE PROPERTIES, AND WHY EACH ONE IS LOAD-BEARING ──────────────
//   1. RESTORE ON EVERY EXIT PATH, SYNCHRONOUSLY. `process.on('exit')` cannot
//      await, so the originals are held in memory as strings and written back
//      with `writeFileSync`. SIGINT/SIGTERM/SIGHUP/SIGBREAK are trapped and
//      re-raised after the restore, so the exit CODE a caller sees is still the
//      signal's. `uncaughtException` and `unhandledRejection` are covered too:
//      an anchor that matched a file whose syntax the mutation broke throws in
//      the harness itself, which is exactly the case a `finally` around the
//      probe would miss.
//      ⚠⚠ AND ON WINDOWS THIS IS NOT ENOUGH, MEASURED RATHER THAN ASSUMED.
//        Node cannot trap SIGTERM on Windows — a handler can be registered and
//        is never called, because the OS terminates unconditionally. Probed on
//        2026-08-16 with a self-SIGTERM after a real mutation: the process died
//        and THE MUTATION SURVIVED. Since a harness timeout is exactly a
//        SIGTERM, that is the very path that produced this incident, and the
//        handler above would have been a control that reads as a control and is
//        not one. SIGINT (Ctrl-C) IS delivered on Windows, so the handler still
//        earns its place — it just cannot be the load-bearing one.
//      ⚠ SIGKILL AND A HARD POWER LOSS ARE NOT COVERABLE IN-PROCESS, by
//        anybody. That is what (1b) and (3) are for.
//
//   1b. THE JOURNAL — the only thing that survives an untrappable kill. Before
//      the FIRST byte is mutated, the originals are written to
//      tests/.mutation-journal.json ON DISK. If the process then dies in any
//      way at all — SIGKILL, a Windows SIGTERM, a power cut — the journal is
//      still there, and the next call to `assertNoResidue()` (or
//      `recoverJournal()`, which the smoke suite runs before anything else)
//      puts every file back and says so, loudly. The journal is deleted only
//      after a restore has been HASH-VERIFIED, so its presence always means
//      "somebody died holding a mutation". This is the same discipline the
//      server uses for `accrued_to`: write the durable record BEFORE the risky
//      operation, never after.
//   2. VERIFY BY HASH, NOT BY "we wrote it back". The restore is itself code
//      that can be wrong — a path that changed, a write that partially failed,
//      a second mutation applied over the first. Every registered file's
//      sha256 is compared against the hash taken BEFORE the first mutation, and
//      a mismatch is a LOUD non-zero exit naming the file, not a warning.
//   3. REFUSE TO START ON RESIDUE. A previous run's residue looks exactly like
//      an original to a harness that snapshots on entry — it would then
//      faithfully "restore" the mutated text and hash-verify it as correct. So
//      a harness calls `assertNoResidue()` first, which looks for its OWN
//      mutations already present in the files it is about to mutate.
//      Deliberately NOT "refuse if the tree is dirty": that refuses on every
//      working tree where the feature is still being built, and a guard that
//      blocks ordinary work is a guard somebody deletes within the week. See
//      the function for the full argument.
//
// ONE IMPLEMENTATION, TWO CALLERS (artisan-accrual, live-settlement). Two
// copies of "prove the restore happened" is one that gets weakened without the
// other noticing — the same rule this repo applies to simulations.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/* ON DISK, beside this module, so any process can find it without being told.
   Gitignored is NOT required and deliberately not relied on: if one is ever
   committed, that is a loud signal a run died holding a mutation. */
export const JOURNAL = join(dirname(fileURLToPath(import.meta.url)), '.mutation-journal.json');

/** path -> { text, hash } as it was BEFORE anything was mutated. */
const originals = new Map();
let armed = false;
let restoredCleanly = true;

/* Rewritten on every new snapshot, BEFORE the caller is allowed to mutate. */
function writeJournal() {
  try {
    writeJournalSync();
  } catch (e) {
    process.stderr.write(`MUTATION SAFETY: cannot write the journal (${e.message}). An untrappable `
      + 'kill would leave production code mutated with no record. Refusing.\n');
    process.exit(2);
  }
}
function writeJournalSync() {
  writeFileSync(JOURNAL, JSON.stringify({
    pid: process.pid,
    started: new Date().toISOString(),
    argv: process.argv.slice(1),
    files: [...originals].map(([file, s]) => ({ file, hash: s.hash, text: s.text })),
  }), 'utf8');
}
function clearJournal() {
  try { if (existsSync(JOURNAL)) unlinkSync(JOURNAL); } catch { /* best effort */ }
}

/**
 * RECOVER FROM AN UNTRAPPABLE KILL. Reads the journal a dead run left behind
 * and puts every file back. Returns the list of files it restored (empty when
 * there was nothing to do), so a caller can report rather than guess.
 *
 * Safe to call unconditionally and safe to call twice: a file that already
 * matches its journalled original is left alone.
 */
export function recoverJournal() {
  if (!existsSync(JOURNAL)) return [];
  let j;
  try { j = JSON.parse(readFileSync(JOURNAL, 'utf8')); }
  catch (e) {
    process.stderr.write(`MUTATION SAFETY: the journal at ${JOURNAL} is unreadable (${e.message}). `
      + 'Delete it only after checking `git diff` by hand.\n');
    return [];
  }
  const fixed = [];
  for (const f of (j.files || [])) {
    try {
      if (readFileSync(f.file, 'utf8') !== f.text) { writeFileSync(f.file, f.text, 'utf8'); fixed.push(f.file); }
    } catch { /* the file moved; nothing safe to do */ }
  }
  if (fixed.length) {
    process.stderr.write('\n'
      + 'MUTATION SAFETY: a previous mutation run (pid ' + j.pid + ', ' + j.started + ') died\n'
      + 'holding mutations. RESTORED from the journal:\n'
      + fixed.map((f) => `  ${f}\n`).join(''));
  }
  clearJournal();
  return fixed;
}

/* SYNCHRONOUS, and it must stay that way: `process.on('exit')` runs no
   microtasks, so an async restore there is a restore that never happens. */
function restoreAllSync() {
  for (const [file, snap] of originals) {
    try {
      if (readFileSync(file, 'utf8') !== snap.text) writeFileSync(file, snap.text, 'utf8');
    } catch (e) {
      restoredCleanly = false;
      process.stderr.write(`\nMUTATION SAFETY: could NOT restore ${file} — ${e.message}\n`);
    }
  }
}

/* THE VERIFICATION, and it is the whole reason this module exists rather than a
   `finally`. Returns the list of files that are NOT byte-identical to their
   pre-mutation snapshot. */
export function verifyRestored() {
  const bad = [];
  for (const [file, snap] of originals) {
    let now;
    try { now = readFileSync(file, 'utf8'); } catch { bad.push(`${file} (unreadable)`); continue; }
    if (sha(now) !== snap.hash) bad.push(file);
  }
  return bad;
}

function arm() {
  if (armed) return;
  armed = true;
  process.on('exit', () => {
    restoreAllSync();
    const bad = verifyRestored();
    if (bad.length || !restoredCleanly) {
      /* Cannot change the exit code from an 'exit' handler, so SHOUT. The
         hash check in `finish()` is what actually fails the run; this is the
         backstop for the paths that never reach it. */
      process.stderr.write('\n'
        + '════════════════════════════════════════════════════════════════\n'
        + 'MUTATION SAFETY FAILURE — PRODUCTION FILES ARE STILL MUTATED:\n'
        + bad.map((f) => `  ${f}\n`).join('')
        + 'Run `git diff` and revert before doing anything else. Do NOT commit.\n'
        + '════════════════════════════════════════════════════════════════\n');
    }
  });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(sig, () => {
      restoreAllSync();
      process.stderr.write(`\nMUTATION SAFETY: ${sig} — ${originals.size} file(s) restored.\n`);
      /* Re-raise with the handler removed, so the caller still observes a
         signal death rather than a tidy exit 0 that hides an interrupted run. */
      process.removeAllListeners(sig);
      process.kill(process.pid, sig);
    });
  }
  for (const ev of ['uncaughtException', 'unhandledRejection']) {
    process.on(ev, (e) => {
      restoreAllSync();
      process.stderr.write(`\nMUTATION SAFETY: ${ev} — files restored. ${e && e.stack ? e.stack : e}\n`);
      process.exit(2);
    });
  }
}

/**
 * Snapshot a file before it is mutated, and arm every exit path.
 * Idempotent per path: the FIRST snapshot wins, so a second mutation of the
 * same file in the same run cannot make a mutated copy the "original".
 */
export function snapshot(file) {
  arm();
  if (!originals.has(file)) {
    const text = readFileSync(file, 'utf8');
    originals.set(file, { text, hash: sha(text) });
    /* THE JOURNAL IS WRITTEN HERE, i.e. BEFORE the caller can mutate anything —
       that ordering is the whole guarantee. Written after would leave a window
       in which a kill loses the original entirely. */
    writeJournal();
  }
  return originals.get(file).text;
}

/** Put every snapshotted file back, now, and say whether it worked. */
export function restoreAll() {
  restoreAllSync();
  return verifyRestored();
}

/**
 * REFUSE TO START ON RESIDUE (property 3), and do it PRECISELY.
 *
 * ── WHY NOT "REFUSE IF THE TREE IS DIRTY" ───────────────────────────────
 * That was the first version, and it is the wrong check twice over. A mutation
 * harness is run most often while its own feature is being built, so `git diff`
 * against HEAD is non-empty for entirely legitimate reasons — the harness
 * refuses on every developer's working tree, and a guard that blocks ordinary
 * work is a guard somebody deletes within the week. It is also not the property
 * that matters: the hazard is not "this file changed", it is "this file still
 * contains a MUTATION from an interrupted run", which is a much narrower and
 * completely checkable thing.
 *
 * So this looks for the residue itself. For every mutation the harness is about
 * to plant, it asks: does the file already contain the MUTATED text where the
 * original should be? That is true only after a crashed run, never during
 * honest editing (the anchors are the harness's own strings), and it is exactly
 * the state that would otherwise be snapshotted as "the original" and then
 * faithfully restored — and hash-verified as correct.
 *
 * @param mutations  [{ file, from, to }] — absolute or repo-relative paths.
 */
export function assertNoResidue(mutations) {
  /* FIRST: recover anything a previously-killed run journalled. On Windows a
     harness timeout is an untrappable SIGTERM, so this — not the signal
     handler — is what actually put the file back. Doing it here means the
     residue scan below runs against a recovered tree and reports only what the
     journal could not explain. */
  recoverJournal();
  const residue = [];
  for (const m of mutations) {
    let text;
    try { text = readFileSync(m.file, 'utf8'); } catch { continue; }
    /* BOTH conditions. `to` present alone is not enough — a mutant whose
       replacement text is a common string (`if false then`) could legitimately
       appear elsewhere. The residue signature is: the mutation is there AND the
       original it replaced is not. */
    if (text.includes(m.to) && !text.includes(m.from)) {
      residue.push(`${m.file}\n      expected: ${JSON.stringify(m.from.slice(0, 80))}`
        + `\n      found:    ${JSON.stringify(m.to.slice(0, 80))}`);
    }
  }
  if (residue.length) {
    process.stderr.write('\n'
      + 'MUTATION SAFETY: REFUSING TO RUN — an earlier run left MUTATIONS in these files:\n'
      + residue.map((s) => `  ${s}\n`).join('')
      + '\nThis is production code that is currently WRONG. Revert those hunks before doing\n'
      + 'anything else — a harness that starts here would snapshot the bug as the original,\n'
      + '"restore" it, and hash-verify it as correct.\n');
    process.exit(2);
  }
}

/**
 * The weaker, ADVISORY companion: say whether the files about to be mutated
 * already differ from HEAD. Never fails the run (see above), but a line on
 * stderr means a `git diff` after an interrupted run has somewhere to start.
 */
export function noteDirtyTree(files, { cwd } = {}) {
  const r = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', ...files],
    { encoding: 'utf8', cwd });
  if (r.status !== 0) return;   // no git; assertNoResidue is the real check
  const dirty = r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  if (dirty.length) {
    process.stderr.write(`mutation safety: ${dirty.length} file(s) to be mutated already differ `
      + `from HEAD (${dirty.join(', ')}). Expected while the feature is in progress; if this run is `
      + 'interrupted, `git diff` those files first.\n');
  }
}

/**
 * The last thing a harness does. Restores, verifies by hash, and exits NON-ZERO
 * with a named file if anything is still mutated — so a leaked mutation fails
 * the run instead of riding out in `git diff`.
 */
export function finish(exitCode = 0) {
  const bad = restoreAll();
  if (bad.length) {
    /* THE JOURNAL IS DELIBERATELY LEFT IN PLACE. The restore failed, so the
       next run must find the record and recover from it — clearing it here
       would destroy the only copy of the originals. */
    process.stderr.write('\nMUTATION SAFETY: restore FAILED for:\n'
      + bad.map((f) => `  ${f}\n`).join('')
      + `The journal is preserved at ${JOURNAL}; the next run will recover from it.\n`);
    process.exit(3);
  }
  clearJournal();   // only ever after a HASH-VERIFIED restore
  process.stderr.write(`mutation safety: ${originals.size} file(s) restored and hash-verified.\n`);
  process.exit(exitCode);
}
