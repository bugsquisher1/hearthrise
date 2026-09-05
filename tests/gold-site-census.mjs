// ============================================================================
// tests/gold-site-census.mjs — EVERY CLIENT GOLD WRITE IS DECLARED, OR THE
// BUILD FAILS.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// The gold surface was measured twice by hand (2026-08-13: "~40 sites";
// 2026-08-14: "47, and 44 are real"), by two agents, with a scanner that was
// written, run, and thrown away both times. A census that lives in prose is a
// census that is wrong by the next merge — and it was: b350's extraction moved
// legacy.js under it and nothing noticed, because nothing could.
//
// b348 is the lesson this file is built on, stated by Tyler after he found it
// himself: **derivation removes the second LIST, it does not remove the second
// SIDE.** `SETTABLE_KINDS` was derived from `PAYABLE_KINDS`, so the server's two
// lists could never drift — and the CLIENT still never said the word, because
// the client is a different side of the contract and no amount of derivation on
// the server reaches it. tests/activity-seam.mjs is the failure that closes
// that gap for activities. This is the same failure for money.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//   L1  every gold write site the scanner finds in src/** is in the ledger
//       (src/net/gold-sites.js), BY NAME.
//   L2  every ledger row corresponds to a site that still exists. A row for a
//       deleted site is a census that describes a codebase nobody is running.
//   L3  the ledger's own shape: a `wired` row names a live verb; a `deferred`
//       row names its blocker; a `none` row says why it will never have one.
//   L4  the verbs a ledger row names are verbs the SERVER actually implements
//       (read out of supabase/functions/hr-accrue/request.js's VERBS — not
//       restated here, or this is one more list to drift).
//   L5  THE CONTROL. The scanner is re-run with its pattern set BLINDED. If the
//       blinded count is not strictly lower, the scanner is not looking at
//       anything and every assertion above passed for free. A guard that cannot
//       demonstrate it sees failure is treated as broken, not as a pass.
//
// ── WHAT IT SEES, AND WHAT IT STILL CANNOT ──────────────────────────────────
// ⚠ THE FIRST REVISION OF THIS PARAGRAPH WAS BOTH WRONG AND COMPLACENT, AND
//   SECURITY BROKE THE GUARD WITH IT. It said the scanner "does NOT see a write
//   routed through a computed property, through `Object.assign`, or through a
//   helper in another module" and then argued that was acceptable because the
//   sites had been collapsed onto one choke point — which it named
//   `HearthriseGold.pay`, a function that has never existed. A limitation
//   documented as a design choice, defended by an API nobody could call.
//
//   All three of those, plus aliasing the seam, were then demonstrated as live
//   evasions past a green census. They are patterns now (see `seamApi`,
//   `seamAlias`, `assignBulk`, `computed` below), each with its own `--selftest`
//   mutation, and the real choke point is `HearthriseGold.settleCurrency`,
//   reached from classic scripts as `window.goldSettle` / `goldSettleCurrency`.
//
// What it genuinely still cannot see: a write through a property name assembled
// at RUNTIME on a receiver that is not `G` (an alias of the state object), and a
// write from a module the walk does not cover (only `src/**` is walked). The
// honest defence for both is the same one that was mis-stated before — there
// are few enough writers to enumerate, and the way to keep it that way is to
// keep collapsing sites into the seam rather than to widen the regex.
//
// ── USAGE ───────────────────────────────────────────────────────────────────
//   node tests/gold-site-census.mjs             the census + the guard
//   node tests/gold-site-census.mjs --report    print the census as a table
//   node tests/gold-site-census.mjs --selftest  every planted defect must be RED
// ============================================================================

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const at = (p) => join(ROOT, p);
const mod = (p) => new URL(p, new URL('../', import.meta.url)).href;

/* ── THE PATTERN SET ────────────────────────────────────────────────────────
   Named, so the CONTROL can remove one and prove the count moves. Each entry is
   a spelling of "this expression writes a gold balance". */
export const PATTERNS = Object.freeze([
  { name: 'compound', re: /([A-Za-z_$][\w$.]*)\.gold\s*(\+=|-=)/g },
  { name: 'assign', re: /([A-Za-z_$][\w$.]*)\.gold\s*=(?!=)/g },
  { name: 'bracket', re: /([A-Za-z_$][\w$.]*)\[\s*['"]gold['"]\s*\]\s*(\+=|-=|=(?!=))/g },
  /* THE SEAM CALLS. A wired gesture no longer writes `.gold` at all — it hands
     the amount to `goldSettle(amount, '<site id>', key)`, which is the whole
     point (one payment path, one place the prediction is recorded). Without
     this pattern those gestures would VANISH from the census the moment they
     were wired, i.e. the guard would go quiet exactly when the surface became
     load-bearing. The id is the literal, so the row survives every edit that
     does not change the gesture. */
  /* `vendorSellChunked` (b377) is a SEAM WRAPPER, not an evasion: it is a thin
     loop in legacy.js that calls `goldSettle(price*chunk, site, key)` once per
     ≤MAX_QTY chunk, so the site id lives at ITS call, not at a bare goldSettle.
     Registering it here keeps `seam:vendor.sell_all` / `seam:vendor.quick_sell`
     visible to the census — the alternative (inlining the chunk loop at both
     call sites) would be two copies of the same payment path, which is the exact
     thing the seam exists to prevent. Same standing as goldSettle wrapping
     settleCurrency. */
  { name: 'seam', re: /(?:goldSettle(?:Currency)?|vendorSellChunked)\(\s*[\s\S]{0,120}?['"]([\w.]+)['"]/g, seam: true },

  /* ══════════════════════════════════════════════════════════════════════════
     F6 — THE FOUR EVASIONS. THE SCANNER WAS BLIND TO ITS OWN API.
     ══════════════════════════════════════════════════════════════════════════
     Security attacked the guard rather than the code, which is the right way
     round, and got four undeclared gold movements past a green census:

       1. `HearthriseGold.settle(G, 1e9, 'x', k)` called RAW — the module API,
          bypassing legacy's `goldSettle` wrapper the `seam` pattern spells.
       2. `Object.assign(G, { gold: 1e9 })` — a bulk write with no `.gold =`
          anywhere in it.
       3. `G['go' + 'ld'] = 1e9` — a computed member, invisible to a scanner
          that matches a literal property name.
       4. `var f = window.goldSettle; f(1e9, 'x', k)` — an ALIAS. The reference
          is taken in one statement and called in another, so no call site
          carries a site-id literal.

     The four patterns below close each by NAME, and each has its own
     `--selftest` mutation. The general lesson is worth more than the patterns:
     **a guard whose subject is a seam must treat the seam itself as an
     attack surface**, because the safest path is exactly the one an evasion
     will be dressed up as. Measured cost in the current tree: 1 site each for
     `seamApi` and `seamAlias` (both inside the wrapper that owns them, both
     declared), 0 for `assignBulk` and `computed`. */

  /* 1 + 4. Any use of the seam that is not `goldSettle(… 'site' …)`:
     - a call through the MODULE (`X.settle(`, `X.settleCurrency(`)
     - a REFERENCE to `goldSettle` that is not immediately a call */
  { name: 'seamApi', re: /\.\s*(settle|settleCurrency)\s*\(/g },
  /* ⚠ THE `\b` IS LOAD-BEARING. Without it the engine backtracks: on
     `goldSettleCurrency(` it tries the long alternative, the `(?!\s*\()`
     lookahead fails on the paren, it drops `Currency` and re-tests the
     lookahead against `C` — which is not a paren — and reports a genuine CALL
     as an alias. Measured: three false rows, all on lines that call the seam
     correctly. A guard that flags the compliant path is a guard people learn to
     silence. */
  { name: 'seamAlias', re: /(?:^|[^.\w$])((?:window\.)?goldSettle(?:Currency)?)\b(?!\s*\()/g },

  /* 2. A bulk write onto the game state. `Object.assign(G, …)` can carry any
        field, so the target is what matters, not the payload. */
  { name: 'assignBulk', re: /Object\.assign\(\s*((?:window\.)?G)\s*,/g },

  /* 3. A COMPUTED member write on the game state. Deliberately matches every
        computed write, not just ones that look like `gold`: the whole point of
        `'go' + 'ld'` is that the property name is not in the source. Zero in the
        tree today, so the cost of the broad rule is zero and the day somebody
        needs one it gets a ledger row and a reason. */
  { name: 'computed', re: /(?:^|[^.\w$])((?:window\.)?G)\s*\[[^\]]{1,80}\]\s*(?:\+=|-=|=(?!=))/g },
]);

/* ── FILES THE CENSUS DOES NOT COVER, AND WHY ───────────────────────────────
   Each exclusion is a DECISION with a reason attached, and L0 below asserts
   each named file still exists — an exclusion that has silently stopped
   matching anything is an exclusion that is hiding the next file. */
export const EXCLUDED = Object.freeze({
  'src/features/smoke-test.js': 'the test suite itself. It sets G.gold to fixture values in ~60 '
    + 'places to drive assertions; those are not economy sites and never ship a server intent.',
  'src/net/gold-sites.js': 'the ledger. It names sites; it does not write gold.',
  /* THE MIRROR IMAGE, and it turned this census red the moment the gem ledger
     landed. src/net/gem-sites.js explains its rows by QUOTING the code they
     describe, and one of those quotes is the site id
     `src/legacy.js#goldSettleCurrency` — which the `seamAlias` pattern reads as
     a reference to the seam taken without calling it. The comment stripper
     cannot see inside a string literal, so a ledger that documents money is
     indistinguishable from one that moves it. gem-sites.js has exactly the
     standing gold-sites.js has: it names sites, it does not write anything.
     tests/gem-site-census.mjs excludes THIS file for the same reason, in the
     same words. */
  'src/net/gem-sites.js': 'the GEM ledger. Its prose quotes gold site ids and gold statements '
    + 'verbatim to explain the gem rows beside them. It names sites; it does not write gold.',
});

/* ── COMMENTS ARE NOT SITES ─────────────────────────────────────────────────
   Found immediately: this codebase documents itself heavily, and the FIRST run
   after the seam landed reported six "undeclared gold write sites" that were
   all prose ABOUT gold write sites — including three inside the header of the
   module that owns the rule. A scanner that cannot tell code from a comment
   trains its readers to skim its output, which is how a real finding gets
   waved through.

   Blanks comment bodies while preserving every newline, so line numbers still
   point at the file. Deliberately naive about `//` inside a string or a regex
   literal: over-stripping can only ever HIDE a site, and hiding a site that is
   in the ledger is caught by L2 (declared-but-not-found), which is a red build.
   The failure direction is guarded, so the simple implementation is the right
   one. */
export function stripComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const two = text.slice(i, i + 2);
    if (two === '//') {
      while (i < n && text[i] !== '\n') { out += ' '; i++; }
    } else if (two === '/*') {
      out += '  '; i += 2;
      while (i < n && text.slice(i, i + 2) !== '*/') { out += text[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
    } else {
      out += text[i]; i++;
    }
  }
  return out;
}

// ── the walk ────────────────────────────────────────────────────────────────
async function jsFiles(dir, out = []) {
  for (const e of await readdir(dir)) {
    const p = join(dir, e);
    if ((await stat(p)).isDirectory()) await jsFiles(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/* Nearest enclosing NAMED function, searching backwards. legacy.js is a classic
   script whose functions are almost all `function name(` at column 0, so this is
   reliable there; elsewhere the module scope answers `(module)`, which is a
   perfectly good site name for a top-level write. */
const FN_RES = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
  /^\s*(?:window\.)?([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*\(/,
  /^\s*(?:window\.)?([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/,
  /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function/,
  /^\s*([A-Za-z_$][\w$]*)\s*:\s*function\s*\(/,
  /^\s*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{\s*$/,
];
/* A control-flow keyword is not a function name. Without this, `if(cond){` on
   the line above a write names the site `#if` — which is not wrong so much as
   useless: three unrelated sites in legacy.js all called `#if` are three rows
   nobody can tell apart in review, which is the opposite of what a census is
   for. Found by running the scanner and reading its own output. */
const NOT_A_FN = new Set(['if', 'for', 'while', 'switch', 'catch', 'do', 'try', 'else',
  'return', 'function', 'with', 'typeof', 'new', 'delete', 'void', 'case', 'in', 'of']);
function enclosingFn(lines, i) {
  for (let j = i; j >= 0 && j > i - 400; j--) {
    /* A `}` in COLUMN ZERO closes a top-level function, so anything above it is
       a different scope. Without this the search walked straight past it and
       attributed a module-level statement to whichever function happened to be
       declared above — `window.goldSettle = goldSettle` reported as being
       inside `goldIntentKey`, which is a site name that sends a reviewer to the
       wrong place. Not a full parse and not trying to be: legacy.js is a
       classic script whose top-level functions all close in column zero. */
    if (j < i && /^\}/.test(lines[j])) return '(module)';
    for (const re of FN_RES) {
      const m = re.exec(lines[j]);
      if (m && !NOT_A_FN.has(m[1])) return m[1];
    }
  }
  return '(module)';
}

/* ── L8's SOURCE PROBE ───────────────────────────────────────────────────────
   A `flipGuard:{gated:'TOKEN'}` annotation is a CLAIM about the code; this turns
   it into a CHECK. Given a scanned site (its file + line + enclosing fn name),
   read the file, walk back from the write to the enclosing function's
   declaration, and answer whether TOKEN appears anywhere in that body. Comments
   are stripped first, so a gate named only in prose does not count — the gate
   has to be real, executable code above the write. Returns null if the file or
   the function boundary cannot be resolved, which L8 treats as "cannot verify"
   and fails loudly rather than passing on an absence. */
async function gateTokenInEnclosingFn(site, token) {
  let text;
  try { text = await readFile(at(site.file), 'utf8'); }
  catch (e) { return null; }
  const lines = stripComments(text.replace(/\r\n/g, '\n')).split('\n');
  const siteIdx = site.line - 1;
  if (siteIdx < 0 || siteIdx >= lines.length) return null;
  let start = -1;
  for (let j = siteIdx; j >= 0 && j > siteIdx - 200; j--) {
    for (const re of FN_RES) {
      const m = re.exec(lines[j]);
      if (m && !NOT_A_FN.has(m[1])) { start = j; break; }
    }
    if (start >= 0) break;
    /* A `}` in column zero closes a top-level function — the write is at module
       scope and there is no enclosing body to gate. Stop here. */
    if (j < siteIdx && /^\}/.test(lines[j])) { start = j + 1; break; }
  }
  if (start < 0) start = Math.max(0, siteIdx - 40);
  const body = lines.slice(start, siteIdx + 1).join('\n');
  return body.indexOf(token) !== -1;
}

/**
 * THE CENSUS. Pure over the filesystem.
 * @param {string[]} patternNames which patterns to use — the CONTROL blinds this.
 * @returns {Promise<{sites:Array, count:number}>}
 */
export async function census(patternNames) {
  const use = PATTERNS.filter((p) => !patternNames || patternNames.includes(p.name));
  const files = (await jsFiles(at('src'))).sort();
  const sites = [];
  const seen = Object.create(null);
  for (const f of files) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    if (Object.prototype.hasOwnProperty.call(EXCLUDED, rel)) continue;
    const lines = stripComments((await readFile(f, 'utf8')).replace(/\r\n/g, '\n')).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const p of use) {
        p.re.lastIndex = 0;
        let m;
        while ((m = p.re.exec(line))) {
          const fn = enclosingFn(lines, i);
          const base = p.seam ? `seam:${m[1]}` : `${rel}#${fn}`;
          seen[base] = (seen[base] || 0) + 1;
          const id = seen[base] === 1 ? base : `${base}@${seen[base]}`;
          sites.push({ id, file: rel, fn, line: i + 1, receiver: m[1],
            pattern: p.name, text: line.trim().slice(0, 160) });
        }
      }
    }
  }
  return { sites, count: sites.length };
}

// ════════════════════════════════════════════════════════════════════════════
/**
 * @param opts.bust re-read the ledger from disk instead of the ESM cache. Only
 *        `--selftest` passes it: a mutation that edits `gold-sites.js` and then
 *        re-imports the cached module is a mutation that was never planted.
 */
export async function runAll(opts) {
  const problems = [];
  const fail = (m) => problems.push(m);
  const bust = (opts && opts.bust) ? `?t=${Date.now()}${Math.random()}` : '';

  let ledgerMod; let request;
  try {
    ledgerMod = await import(mod('src/net/gold-sites.js') + bust);
    request = await import(mod('supabase/functions/hr-accrue/request.js'));
  } catch (e) {
    fail('GOLD CENSUS: the ledger or the server verb list could not be loaded, so NOTHING below '
      + 'ran: ' + (e && e.message));
    return { problems, note: 'not run' };
  }
  const LEDGER = ledgerMod.GOLD_SITE_LEDGER;

  // ── L0: every declared exclusion is a real file ──────────────────────────
  for (const rel of Object.keys(EXCLUDED)) {
    try { await stat(at(rel)); }
    catch (e) {
      fail(`GOLD CENSUS: '${rel}' is on the exclusion list and does not exist. An exclusion that has `
        + 'stopped matching anything is not neutral — it is a hole waiting for the next file that '
        + 'happens to be named that.');
    }
  }

  const { sites, count } = await census();

  // ── L5: THE CONTROL, RUN FIRST ──────────────────────────────────────────
  /* ⚠ THE CONTROL BLINDS ONE PATTERN, NOT ALL OF THEM. Blinding down to a
     pattern that matches nothing gives 0 — which "drops", and would go on
     dropping if every other pattern were also broken. The honest control
     removes `assign` (the single most productive spelling) and demands the
     count fall while staying ABOVE zero: that is the only shape that proves
     BOTH halves of the pattern set are live. */
  const blind = await census(['compound', 'seam']);
  if (!(blind.count < count && blind.count > 0)) {
    fail(`GOLD CENSUS CONTROL: blinding the 'assign' pattern moved the count ${count} -> ${blind.count}. `
      + 'It must fall (or the scanner is not reading its own patterns) and it must stay above zero '
      + '(or the remaining patterns are dead and the drop proves nothing). Either way every '
      + 'assertion below passed for free.');
  }
  if (count === 0) {
    fail('GOLD CENSUS: ZERO gold write sites found in src/**. That is not a clean codebase, it is a '
      + 'broken scanner — the client still spends and is paid gold in dozens of places.');
    return { problems, note: 'scanner blind' };
  }

  // ── L1: every site is declared ──────────────────────────────────────────
  const byId = new Map(sites.map((s) => [s.id, s]));
  for (const s of sites) {
    if (!Object.prototype.hasOwnProperty.call(LEDGER, s.id)) {
      fail(`GOLD CENSUS: an UNDECLARED gold write site — ${s.id} (${s.file}:${s.line})\n`
        + `      ${s.text}\n`
        + '      Every site that moves a gold balance must have a row in src/net/gold-sites.js '
        + 'naming the server verb that owns it, or naming what blocks one. This is the b348 '
        + 'failure applied to money: a surface the server was never told about is a surface that '
        + 'pays a client-authored number forever, silently, and nothing in a green suite says so.');
    }
  }

  // ── L2: every declared site still exists ────────────────────────────────
  for (const id of Object.keys(LEDGER)) {
    if (!byId.has(id)) {
      fail(`GOLD CENSUS: the ledger declares '${id}' and the scanner cannot find it. Either the site `
        + 'moved (rename the row) or it is gone (delete the row). A census that describes code '
        + 'nobody is running is worse than no census, because it is READ as one.');
    }
  }

  // ── L3/L4: the ledger's own shape ───────────────────────────────────────
  const VERBS = new Set(request.VERBS);
  if (!VERBS.size) {
    fail('GOLD CENSUS: the server verb list is empty, so L4 compared nothing.');
  }
  for (const [id, row] of Object.entries(LEDGER)) {
    if (!ledgerMod.STATUSES.includes(row.status)) {
      fail(`GOLD CENSUS: '${id}' has status '${row.status}', which is not one of `
        + `[${ledgerMod.STATUSES}].`);
      continue;
    }
    if (!row.kind || !ledgerMod.KINDS.includes(row.kind)) {
      fail(`GOLD CENSUS: '${id}' has kind '${row.kind}', which is not one of [${ledgerMod.KINDS}].`);
    }
    if (row.status === 'wired') {
      if (!row.verb) {
        fail(`GOLD CENSUS: '${id}' is marked wired and names no verb.`);
      } else if (!VERBS.has(row.verb)) {
        fail(`GOLD CENSUS: '${id}' is wired to '${row.verb}', which the server's own parser does not `
          + `accept (VERBS = [${[...VERBS]}]). Every real player gesture there would spend a rate `
          + 'budget to earn a 400 unknown_verb.');
      }
    }
    if (row.status === 'deferred' && !row.blockedBy) {
      fail(`GOLD CENSUS: '${id}' is deferred with no \`blockedBy\`. "Not yet" without a named `
        + 'dependency is indistinguishable from "forgotten", which is the state this ledger exists '
        + 'to make impossible.');
    }
    if (row.status === 'none' && !row.why) {
      fail(`GOLD CENSUS: '${id}' is marked 'none' with no \`why\`. A site that will never have a `
        + 'server verb has to say what makes it exempt, or the exemption is just an omission.');
    }
    if (row.verb && !VERBS.has(row.verb)) {
      fail(`GOLD CENSUS: '${id}' names verb '${row.verb}', which does not exist server-side.`);
    }
  }

  /* ── L6: THE WIRED SET IS NOT EMPTY, AND IT IS NOT EVERYTHING ────────────
     Two ways this guard rots into decoration: a ledger where nothing is wired
     (it degenerates into a to-do list nobody reads) and one where everything
     claims to be (a status that is never false says nothing). */
  const wired = Object.values(LEDGER).filter((r) => r.status === 'wired');
  const deferred = Object.values(LEDGER).filter((r) => r.status === 'deferred');
  if (!wired.length) {
    fail('GOLD CENSUS: NOTHING is wired. The ledger has become a to-do list, and a to-do list does '
      + 'not fail a build.');
  }
  if (!deferred.length) {
    fail('GOLD CENSUS-CONTROL: NOTHING is deferred. Either every gold site in the game now routes '
      + 'through a server verb — in which case delete this check and celebrate — or the status '
      + 'field has stopped discriminating.');
  }

  /* ── L7: THE FLIP PLAN COVERS EVERY DEFERRED SITE (F10) ──────────────────
     A deferred site is not inert on flip day — it is WRONG, in a direction set
     by the sign of the movement, because the server envelope is applied
     absolutely. Every row must resolve to a stated behaviour, and the set of
     answers must have more than one member: a derivation that collapsed to one
     string would pass a "has a behaviour" check while saying nothing. */
  const behaviours = new Set();
  for (const [id, row] of Object.entries(LEDGER)) {
    const b = ledgerMod.flipBehaviourOf(row);
    if (!b) {
      fail(`GOLD CENSUS: '${id}' (kind '${row.kind}') has no FLIP BEHAVIOUR. On the day the switch `
        + 'goes on, a site with no server verb is not inert — a grant is ERASED by the next '
        + 'absolute envelope and a spend is REFUNDED. A row nobody can answer that question for is '
        + 'a row that gets discovered by a player.');
    } else if (row.status === 'deferred') behaviours.add(b);
  }
  if (behaviours.size < 2) {
    fail(`GOLD CENSUS-CONTROL: every deferred site resolves to the SAME flip behaviour `
      + `(${behaviours.size} distinct). The derivation has collapsed, so L7 is asserting that a `
      + 'constant is non-empty.');
  }

  /* ── L8: THE UNGATED-TRANSFER GUARD (Security gold-flip Finding #3) ───────
     Every `deferred` gold site whose kind is `transfer` or `grant` is a client
     write with no live server verb. On the day gold joins SERVER_OF_RECORD such
     a write is not merely stale — a `transfer` arms into a FREE CROSS-PLAYER
     REFUND (the class Finding #1 belonged to) and a `grant` silently ERASES a
     legitimately-earned reward. This makes that un-regressable: each such row
     must resolve to a `flipGuard` that is EITHER a code gate present in the site
     (verified against source, not taken on faith) OR a documented server-side
     counterparty write. A row with neither fails the build. */
  const flipGuardOf = ledgerMod.flipGuardOf;
  if (typeof flipGuardOf !== 'function') {
    fail('GOLD CENSUS: src/net/gold-sites.js does not export flipGuardOf, so L8 (the ungated-'
      + 'transfer guard) cannot run — a deferred transfer could arm into a free cross-player refund '
      + 'with nothing to say so.');
  } else {
    for (const [id, row] of Object.entries(LEDGER)) {
      if (row.status !== 'deferred' || (row.kind !== 'transfer' && row.kind !== 'grant')) continue;
      const g = flipGuardOf(row);
      if (!g || !g.valid) {
        fail(`GOLD CENSUS: deferred ${row.kind} site '${id}' has no valid \`flipGuard\` `
          + `(${(g && g.reason) || 'missing'}). On the gold record-flip a ${row.kind} with no server `
          + 'verb ' + (row.kind === 'transfer'
            ? 'arms into a FREE CROSS-PLAYER REFUND — the local rollback restores the buyer while the '
              + 'counterparty ledger stands server-side (Finding #1). '
            : 'ERASES a reward the player earned when the next absolute envelope overwrites it. ')
          + "Declare `flipGuard:{gated:'<switch>'}` (and gate the write) or "
          + "`flipGuard:{serverCredits:'<rpc>'}` (and credit it server-side).");
        continue;
      }
      if (g.mode !== 'gated') continue;   // serverCredits is documented, not code-scannable here
      const site = byId.get(id);
      if (!site) continue;                // L2 already fails a declared-but-missing site
      const present = await gateTokenInEnclosingFn(site, g.token);
      if (present === null) {
        fail(`GOLD CENSUS: '${id}' claims flipGuard gate '${g.token}' but its source (${site.file}:`
          + `${site.line}) could not be read to verify it. An unverifiable gate is treated as absent.`);
      } else if (!present) {
        fail(`GOLD CENSUS: '${id}' claims flipGuard gate '${g.token}', but that token does NOT appear `
          + `in the enclosing function at ${site.file}:${site.line}. The annotation says the write is `
          + 'gated; the code does not gate it. This is exactly the ungated value-crossing write the '
          + 'flip turns into a free refund — the ledger must not vouch for a gate the code lacks.');
      }
    }
  }

  return {
    problems,
    note: `${count} gold write sites in src/** (control: ${blind.count} when blinded); `
      + `${wired.length} wired, ${deferred.length} deferred, `
      + `${Object.values(LEDGER).filter((r) => r.status === 'none').length} exempt`,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE MUTATION CATALOGUE — `--selftest`
   ══════════════════════════════════════════════════════════════════════════
   Every entry plants a REAL defect in the REAL tree and demands this guard
   turns red. A guard that cannot demonstrate it sees failure is treated as
   broken, not as a pass.

   ⚠ TWO OF THEM PLANT A NEW FILE RATHER THAN EDITING AN OLD ONE, and that is
     the delta-transport T6 lesson: the site that brings a defect class back is
     the one nobody names, in a file that does not exist yet. A mutation that
     edits a file already covered by a row proves only that the row is read.

   Each restores the tree in a `finally`, and the restore is verified — a
   selftest that leaves a probe file behind would make the NEXT run red for the
   wrong reason and teach whoever hits it to distrust the guard. */
const PROBE = 'src/net/__census_probe.js';
const LEDGER_FILE = 'src/net/gold-sites.js';

export const MUTATIONS = {
  plant_raw_site: {
    why: 'a brand-new file acquires a raw `G.gold +=`. This is how every gold site got here in the '
      + 'first place, and it is the one the ledger must catch by NAME.',
    plant: async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(at(PROBE), 'export function probePay(G){ G.gold += 1; }\n', 'utf8');
    },
  },
  plant_seam_site: {
    why: 'a new gesture calls the payment seam with a site id nobody declared. The seam is the SAFE '
      + 'path, so this is the mutation that proves using it is not a way to opt out of the census.',
    plant: async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(at(PROBE),
        "export function probeSell(){ window.goldSettle(5, 'vendor.undeclared_sweep', null); }\n", 'utf8');
    },
  },
  stale_ledger_row: {
    why: 'the ledger keeps a row for a site that no longer exists. A census describing code nobody '
      + 'runs is worse than none, because it is READ as one.',
    file: LEDGER_FILE,
    find: "  'src/legacy.js#buyTrait': {",
    repl: "  'src/legacy.js#buyTraitTypo': {",
  },
  wired_to_a_verb_that_does_not_exist: {
    why: 'a wired row names a verb the server\'s own parser does not accept. Every real gesture '
      + 'there would spend a rate slot to earn a 400 unknown_verb.',
    file: LEDGER_FILE,
    find: "    kind: 'vendor', status: 'wired', verb: 'vendor_sell',\n    site: 'src/legacy.js invSellOne()",
    repl: "    kind: 'vendor', status: 'wired', verb: 'vendor_sellx',\n    site: 'src/legacy.js invSellOne()",
  },
  /* ── F6: THE FOUR EVASIONS, ONE MUTATION EACH ─────────────────────────────
     Each plants a NEW FILE containing an undeclared gold movement written the
     way an evasion would be written — through the seam's own API, in bulk,
     computed, or aliased. All four passed the first revision of this guard. */
  evade_via_module_api: {
    why: 'F6-1 — the module API called RAW (`HearthriseGold.settle(G, 1e9, …)`), bypassing the '
      + '`goldSettle` wrapper the `seam` pattern spells. The safest-looking path is exactly what an '
      + 'evasion dresses itself as.',
    plant: async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(at(PROBE),
        'export function probeApi(G, k){ window.HearthriseGold.settle(G, 1e9, \'probe.raw\', k); }\n', 'utf8');
    },
  },
  evade_via_bulk_assign: {
    why: 'F6-2 — `Object.assign(G, { gold: 1e9 })`. A bulk write onto the game state with no '
      + '`.gold =` anywhere in it.',
    plant: async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(at(PROBE), 'export function probeBulk(G){ Object.assign(G, { gold: 1e9 }); }\n', 'utf8');
    },
  },
  evade_via_computed_key: {
    why: 'F6-3 — `G[\'go\' + \'ld\'] = 1e9`. The property name is not in the source, which is the '
      + 'entire point of writing it that way.',
    plant: async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(at(PROBE), "export function probeComputed(G){ G['go' + 'ld'] = 1e9; }\n", 'utf8');
    },
  },
  evade_via_alias: {
    why: 'F6-4 — the seam ALIASED. The reference is taken in one statement and called in another, '
      + 'so no call site carries a site-id literal for the census to read.',
    plant: async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(at(PROBE),
        'export function probeAlias(){ var f = window.goldSettle; f(1e9, 0, null); }\n', 'utf8');
    },
  },
  flip_behaviour_missing: {
    why: 'F10 — a deferred row whose kind has no flip behaviour. On flip day nobody could say '
      + 'whether that site erases the player\'s gold or refunds it.',
    file: LEDGER_FILE,
    /* b46x: re-anchored. buyTrait's row grew a `site:` note and a flipGuard when
       hr_trait_buy took over the purchase, so the old single-line anchor named a
       row that no longer exists — a planted bug that was never planted. The
       property under test is unchanged: a deferred row whose KIND has no flip
       behaviour must fail. */
    find: "  'src/legacy.js#buyTrait': {\n    kind: 'spend', status: 'deferred', blockedBy: B.UNLOCK_BUY,",
    repl: "  'src/legacy.js#buyTrait': {\n    kind: 'mystery', status: 'deferred', blockedBy: B.UNLOCK_BUY,",
  },
  deferred_with_no_blocker: {
    why: '"not yet" with no named dependency is indistinguishable from "forgotten" — which is the '
      + 'exact state this ledger exists to make impossible.',
    file: LEDGER_FILE,
    /* b355: re-anchored. The old anchor was `src/market.js#buyListing`, which is
       now `seam:market.buy` and WIRED — a mutation whose anchor names a row that
       no longer exists is a planted bug that was never planted. Re-pointed at a
       row that is still deferred rather than deleted, because the property is
       about the DEFERRED class and that class is not empty. */
    find: "  'src/market.js#placeBuyOffer': {\n    kind: 'transfer', status: 'deferred', blockedBy: B.MARKET_BUY_OFFERS,\n    flipGuard: { gated: 'serverMarketActive' },\n  },",
    repl: "  'src/market.js#placeBuyOffer': {\n    kind: 'transfer', status: 'deferred',\n    flipGuard: { gated: 'serverMarketActive' },\n  },",
  },
  /* ── L8: THE UNGATED-TRANSFER CLASS (Security gold-flip Finding #3) ────────
     Two mutations, because there are two ways a value-crossing gold write arms
     wrong: it can carry NO flip-guard at all, or claim a gate the code does not
     have. Both are the planted-ungated-transfer the guard exists to catch. */
  transfer_flip_guard_removed: {
    why: 'a deferred transfer loses its flipGuard entirely. On flip that write is a client-authored '
      + 'value-crossing refund the server never authorised — Finding #1, un-annotated.',
    file: LEDGER_FILE,
    /* b411→2026-08-19: re-anchored. The old anchor was raids.js#grantReward,
       whose gated:clientMayWriteRecordField flipGuard became serverCredits when
       raid_claim started crediting the chest in-RPC. Re-pointed at clan contribute,
       which is still a deferred, gated transfer — the property is about the
       DEFERRED-TRANSFER class, and that class is not empty. */
    find: "    flipGuard: { gated: 'CLAN_LAUNCHED' },\n  },",
    repl: "  },",
  },
  transfer_flip_guard_gate_absent_in_code: {
    why: 'a deferred transfer CLAIMS a code gate whose token is nowhere in the site. The annotation '
      + 'vouches for a gate the code lacks — the exact lie L8 must not take on faith.',
    file: LEDGER_FILE,
    find: "blockedBy: B.MARKET_V2_NO_COLLECT,\n    flipGuard: { gated: 'serverMarketActive' },",
    repl: "blockedBy: B.MARKET_V2_NO_COLLECT,\n    flipGuard: { gated: 'serverMarketNOTactive' },",
  },
};

async function selftest() {
  const { writeFile, readFile: rf, rm } = await import('node:fs/promises');
  let slipped = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    let restore = null;
    try {
      if (m.plant) { await m.plant(); restore = async () => rm(at(PROBE), { force: true }); }
      else {
        const p = at(m.file);
        /* ⚠ NORMALISED BEFORE MATCHING, RESTORED FROM THE ORIGINAL BYTES.
           `core.autocrlf` is on in this repo and these files are not pinned by
           .gitattributes, so a file written with LF here comes back from a
           checkout with CRLF — and every multi-line anchor then matches ZERO
           times. It did, immediately after the rebase: a mutation that was
           never planted reports as a harness error if you are lucky and as a
           pass if you are not. */
        const raw = await rf(p, 'utf8');
        const src = raw.replace(/\r\n/g, '\n');
        const n = src.split(m.find).length - 1;
        if (n !== 1) {
          console.log(`  HARNESS x ${id}: anchor matched ${n} times (need exactly 1) in ${m.file}`);
          slipped++; continue;
        }
        await writeFile(p, src.replace(m.find, m.repl), 'utf8');
        restore = async () => writeFile(p, raw, 'utf8');
      }
      /* `bust`, because a mutated ledger read out of the ESM cache is a mutation
         that was never planted. NOT a re-import of THIS module: that re-runs the
         CLI block below, which re-runs the selftest, which recurses until the
         heap dies — measured, on the first attempt. */
      const { problems } = await runAll({ bust: true });
      if (problems.length) console.log(`  CAUGHT  ${id} (${problems.length} problem(s))`);
      else { console.log(`  SLIPPED ${id} — ${m.why}`); slipped++; }
    } catch (e) {
      console.log(`  HARNESS x ${id}: ${e && e.message}`);
      slipped++;
    } finally {
      if (restore) await restore();
    }
  }
  /* THE RESTORE IS VERIFIED, not assumed. */
  const after = await runAll({ bust: true });
  if (after.problems.length) {
    console.log('  HARNESS x the tree was NOT restored — the guard is red after the selftest:');
    for (const p of after.problems) console.log(`      ${p}`);
    slipped++;
  }
  console.log(slipped ? `\nSELFTEST FAILED — ${slipped} slipped` : '\nSELFTEST OK — every mutation caught');
  return slipped;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(new URL(`file://${process.argv[1]}`).href)
  .replace(/\\/g, '/').endsWith('gold-site-census.mjs');
if (isMain) {
  if (process.argv.includes('--report')) {
    const { sites } = await census();
    let ledger = {};
    try { ledger = (await import(mod('src/net/gold-sites.js'))).GOLD_SITE_LEDGER; } catch (e) {}
    for (const s of sites) {
      const row = ledger[s.id] || {};
      console.log(`${String(s.line).padStart(6)} ${s.id.padEnd(52)} ${String(row.kind || '?').padEnd(9)} `
        + `${String(row.status || 'UNDECLARED').padEnd(9)} ${row.verb || row.blockedBy || row.why || ''}`);
    }
    console.log(`\n${sites.length} sites`);
    process.exit(0);
  }
  if (process.argv.includes('--selftest')) process.exit((await selftest()) ? 1 : 0);
  const { problems, note } = await runAll();
  for (const p of problems) console.log(`  x ${p}`);
  console.log(problems.length ? `\nFAILED — ${problems.length} problem(s)` : `\nOK — ${note}`);
  process.exit(problems.length ? 1 : 0);
}
