// ============================================================================
// tests/gem-site-census.mjs — EVERY CLIENT GEM WRITE IS DECLARED, AND EVERY
// GEM SPEND IS GATED, OR THE BUILD FAILS.
//
// ── WHY THIS FILE EXISTS (the root cause, not the three bugs) ───────────────
// b500 swept the "optimistic-apply, swallowed-rejection" class and fixed four
// sites — upgradeProperty, upgradeRoom, buildPlot and buyBankSpaceGold. It
// missed buyBankSpaceGem, buyTheme and buyCosmetic, and the reason it missed
// them is structural rather than careless: **the census was currency-shaped and
// only GOLD had one.** tests/gold-site-census.mjs scans for `.gold` writes
// (PATTERNS: /\.gold\s*(\+=|-=)/ …). A `G.gems -= price` is invisible to it, in
// every file, forever. So gold got a ledger that cannot go stale and gems got
// nothing, and three premium purchases sat client-authored under a green suite
// for the whole life of the gems arm.
//
// `gems` is on SERVER_OF_RECORD (src/net/record.js) with NO dormant gate — it is
// ARMED — and accrue.js applyEnvelopeState writes it ABSOLUTELY. So an
// undeclared gem SPEND is not merely untidy: it is REFUNDED by the next
// envelope while whatever it bought stays granted. That is the b371 dupe ("the
// purchase became free"), and it is the exact failure 2026-09-08-hero-slot-buy.
// sql was written to close for the fourth site.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//   L0  every declared exclusion is a real file (an exclusion that has stopped
//       matching anything is a hole waiting for the next file named that).
//   L1  every gem write site the scanner finds in src/** is in the ledger
//       (src/net/gem-sites.js) BY NAME.
//   L2  every ledger row corresponds to a site that still exists. A row for a
//       deleted site describes a codebase nobody is running.
//   L3  the ledger's own shape: `wired` names a live server verb, `deferred`
//       names its blocker, `none` says why it will never have one.
//   L4  the verbs a `wired` row names are verbs the SERVER actually implements
//       (read out of hr-accrue/request.js VERBS + the RPC names goal-claim.js
//       calls — not restated here, or this is one more list to drift).
//   L5  ⚠ THE ONE THAT WOULD HAVE CAUGHT THE THREE BUGS. Every row whose kind
//       is `spend` or `grant` and whose status is not `wired` MUST carry an
//       `armGuard`, and the guard is SOURCE-PROBED, not believed: the named
//       token has to appear as real code inside the gating function's body
//       (comments stripped first, so a gate that exists only in prose does not
//       count). A client-authored movement of an ARMED balance with no arm
//       check is the defect, so that is what is checked.
//   L6  THE CONTROL. The scan is re-run with the pattern set BLINDED. If the
//       blinded count is not strictly lower AND still above zero, the scanner
//       is not looking at anything and every assertion above passed for free.
//
// ── WHY A SEPARATE FILE FROM gold-site-census.mjs ──────────────────────────
// Deliberate, and it is the DUPLICATION that is cheap here. The gold census is
// green and load-bearing; generalising it into a two-currency scanner would put
// a refactor underneath the guard that protects the live gold economy in order
// to add a second one. The walk (~60 lines) is restated; the RULES are not the
// same rules — gold has a live seam (`goldSettle`) and a flip that has not
// happened, gems are ARMED TODAY and have no seam of their own, so L5 exists
// here and has no counterpart there. Two currencies, two contracts.
//
// ── USAGE ───────────────────────────────────────────────────────────────────
//   node tests/gem-site-census.mjs             the census + the guard
//   node tests/gem-site-census.mjs --report    print the census as a table
//   node tests/gem-site-census.mjs --selftest  every planted defect must be RED
// ============================================================================

import { readdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const at = (p) => join(ROOT, p);
const mod = (p) => new URL(p, new URL('../', import.meta.url)).href;

/* ── THE PATTERN SET ────────────────────────────────────────────────────────
   Named, so the CONTROL can blind one and prove the count moves. Each entry is
   a spelling of "this expression writes a gem balance".

   ⚠ TWO SHAPES ARE DELIBERATELY NOT HERE, AND THE OMISSION IS ENFORCED (L7).
   Security's evasions against the gold census included `Object.assign(G, {…})`
   and a COMPUTED member write (`G['ge'+'ms'] = …`). Both are real and both
   would smuggle a gem write past the three patterns below — but the gold
   census's `assignBulk` and `computed` patterns key on the RECEIVER (`G`), not
   on the property name, so they already match every one of those statements at
   full strength no matter which currency it moves. Restating them here produced
   fourteen duplicate rows describing the same fourteen lines, which is not
   defence in depth, it is a second list to drift.

   So this census DELEGATES those two shapes, and L7 turns the delegation into a
   check: if either pattern ever leaves gold-site-census.mjs, this build fails
   and says which shape stopped being covered. A delegation nobody verifies is
   just a gap with a comment on it. */
export const PATTERNS = Object.freeze([
  { name: 'compound', re: /([A-Za-z_$][\w$.]*)\.gems\s*(\+=|-=)/g },
  { name: 'assign', re: /([A-Za-z_$][\w$.]*)\.gems\s*=(?!=)/g },
  { name: 'bracket', re: /([A-Za-z_$][\w$.]*)\[\s*['"]gems['"]\s*\]\s*(\+=|-=|=(?!=))/g },
]);

/** Shapes this census does not scan because the gold census already covers them
 *  by receiver. L7 asserts each is still in ITS pattern set. */
export const DELEGATED_TO_GOLD_CENSUS = Object.freeze({
  assignBulk: '`Object.assign(G, {…})` — a bulk write onto the game state. Keys on the TARGET, so '
    + 'it matches a payload carrying `gems` exactly as well as one carrying `gold`.',
  computed: "`G['ge'+'ms'] = …` — a computed member write. Deliberately broad there: the point of a "
    + 'computed name is that the property is not in the source at all.',
});

/* ── FILES THE CENSUS DOES NOT COVER, AND WHY ───────────────────────────────
   Each exclusion is a DECISION with a reason attached; L0 asserts each named
   file still exists. */
export const EXCLUDED = Object.freeze({
  'src/features/smoke-test.js': 'the test suite itself. It sets G.gems to fixture values in dozens '
    + 'of places to drive assertions; those are not economy sites and never ship a server intent.',
  'src/net/gem-sites.js': 'the ledger. It names sites; it does not write gems.',
  'src/net/gold-sites.js': 'the GOLD ledger. Its `why:` prose quotes ten real write statements '
    + "verbatim (`G.gems += …`, `G[f] = …`) to explain them, and the comment stripper cannot see "
    + 'inside a string literal. Scanning it reported ten "undeclared gem writes" that were all '
    + 'documentation. It is a ledger; it does not write gems either.',
});

/* ── COMMENTS ARE NOT SITES ─────────────────────────────────────────────────
   This codebase documents itself heavily and the gem sites are now the most
   heavily-commented in the tree — the FIRST run of this scanner reported eight
   "undeclared gem write sites" that were all prose ABOUT gem write sites,
   five of them inside the header of the gate that fixes them.

   Blanks comment bodies while preserving every newline, so line numbers still
   point at the file. Deliberately naive about `//` inside a string or a regex
   literal: over-stripping can only ever HIDE a site, and hiding a site that is
   in the ledger is caught by L2 (declared-but-not-found), which is a red build.
   The failure direction is guarded, so the simple implementation is right. */
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
/* A control-flow keyword is not a function name — three unrelated sites all
   called `#if` are three rows nobody can tell apart in review. */
const NOT_A_FN = new Set(['if', 'for', 'while', 'switch', 'catch', 'do', 'try', 'else',
  'return', 'function', 'with', 'typeof', 'new', 'delete', 'void', 'case', 'in', 'of']);
function enclosingFn(lines, i) {
  for (let j = i; j >= 0 && j > i - 400; j--) {
    /* A `}` in COLUMN ZERO closes a top-level function, so anything above it is
       a different scope. */
    if (j < i && /^\}/.test(lines[j])) return '(module)';
    for (const re of FN_RES) {
      const m = re.exec(lines[j]);
      if (m && !NOT_A_FN.has(m[1])) return m[1];
    }
  }
  return '(module)';
}

/* ── L5's SOURCE PROBE ───────────────────────────────────────────────────────
   An `armGuard: { gated: 'TOKEN' }` annotation is a CLAIM about the code; this
   turns it into a CHECK. Read the file, find the body of the gating function,
   and answer whether TOKEN appears as real (comment-stripped) code in it.

   `where` names a DIFFERENT function to probe, for the one shape that genuinely
   needs it: src/multi-character.js `unlockSlot` is the PRE-ARM path and its arm
   check lives in its only caller, `buySlot` (that module's own header says so in
   those words — "Do NOT wire a new caller to this"). Probing `unlockSlot`'s body
   would report a false RED on code that is correct; probing nothing would let
   the whole class through. Naming the caller is the honest third option, and it
   is a claim the probe still verifies rather than takes on trust.

   Returns null when the function body cannot be resolved — which L5 treats as
   "cannot verify" and FAILS, rather than passing on an absence. */
async function armTokenInBody(file, fnName, token) {
  let text;
  try { text = await readFile(at(file), 'utf8'); } catch (e) { return null; }
  const lines = stripComments(text.replace(/\r\n/g, '\n')).split('\n');
  let start = -1;
  for (let j = 0; j < lines.length; j++) {
    for (const re of FN_RES) {
      const m = re.exec(lines[j]);
      if (m && m[1] === fnName) { start = j; break; }
    }
    if (start >= 0) break;
  }
  if (start < 0) return null;
  /* THE BODY ENDS AT THE CLOSING BRACE AT THE DECLARATION'S OWN INDENT.
     Column-zero-only would have been wrong for most of the tree: every gem
     GRANT site (muster payChest, raids grantReward, collection-log
     msGrantLocally, renown grantLocally) lives two spaces deep inside an IIFE
     module, so the first `^}` is the END OF THE FILE and the probe would have
     read the whole module — an over-permissive probe that answers "yes" for a
     token that is anywhere at all. Measured on this tree before the fix.

     Not a parser and not trying to be. It is bounded in the direction that
     matters (too NARROW fails loudly, too WIDE is what M1/M5 in --selftest
     exist to catch), and a declaration whose brace never closes at its own
     indent returns null, which L5 reads as "cannot verify" and fails. */
  const indent = (/^(\s*)/.exec(lines[start]) || ['', ''])[1];
  const closer = new RegExp('^' + indent + '\\}');
  let end = -1;
  for (let j = start + 1; j < lines.length; j++) {
    if (closer.test(lines[j])) { end = j + 1; break; }
  }
  if (end < 0) return null;
  return lines.slice(start, end).join('\n').indexOf(token) !== -1;
}

/**
 * THE CENSUS. Pure over the filesystem.
 * @param {string[]} patternNames which patterns to use — the CONTROL blinds this.
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
          const base = `${rel}#${fn}`;
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
 *        `--selftest` passes it: a mutation that edits `gem-sites.js` and then
 *        re-imports the cached module is a mutation that was never planted.
 */
export async function runAll(opts) {
  const problems = [];
  const fail = (m) => problems.push(m);
  const bust = (opts && opts.bust) ? `?t=${Date.now()}${Math.random()}` : '';

  let ledgerMod; let request; let goalClaimSrc;
  try {
    ledgerMod = await import(mod('src/net/gem-sites.js') + bust);
    request = await import(mod('supabase/functions/hr-accrue/request.js'));
    goalClaimSrc = await readFile(at('src/net/goal-claim.js'), 'utf8');
  } catch (e) {
    fail('GEM CENSUS: the ledger or the server verb list could not be loaded, so NOTHING below '
      + 'ran: ' + (e && e.message));
    return { problems, note: 'not run' };
  }
  const LEDGER = ledgerMod.GEM_SITE_LEDGER;
  const { KINDS, STATUSES } = ledgerMod;

  // ── L0: every declared exclusion is a real file ──────────────────────────
  for (const rel of Object.keys(EXCLUDED)) {
    try { await stat(at(rel)); }
    catch (e) {
      fail(`GEM CENSUS L0: '${rel}' is on the exclusion list and does not exist. An exclusion that `
        + 'has stopped matching anything is not neutral — it is a hole waiting for the next file '
        + 'that happens to be named that.');
    }
  }

  const { sites } = await census();
  const found = new Map(sites.map((s) => [s.id, s]));
  const declared = new Map(LEDGER.map((r) => [r.id, r]));

  // ── L1: every scanned site is declared ───────────────────────────────────
  for (const s of sites) {
    if (!declared.has(s.id)) {
      fail(`GEM CENSUS L1: UNDECLARED gem write site '${s.id}' (${s.file}:${s.line}, pattern `
        + `${s.pattern}) — "${s.text}". Every client gem movement must be named in `
        + 'src/net/gem-sites.js with its kind, its status and either the server verb that owns it '
        + 'or the dependency that blocks one. gems is ARMED: an undeclared SPEND is refunded by '
        + 'the next envelope while what it bought stays granted.');
    }
  }

  // ── L2: every declared row still exists ──────────────────────────────────
  for (const r of LEDGER) {
    if (!found.has(r.id)) {
      fail(`GEM CENSUS L2: ledger row '${r.id}' names a site the scanner cannot find. Either the `
        + 'site moved (rename the row) or it is gone (delete the row). A census that describes a '
        + 'codebase nobody is running is worse than no census.');
    }
  }

  // ── L3: the ledger's own shape ───────────────────────────────────────────
  const seenIds = new Set();
  for (const r of LEDGER) {
    if (seenIds.has(r.id)) fail(`GEM CENSUS L3: duplicate ledger row id '${r.id}'.`);
    seenIds.add(r.id);
    if (!KINDS.includes(r.kind)) fail(`GEM CENSUS L3: '${r.id}' has unknown kind '${r.kind}'.`);
    if (!STATUSES.includes(r.status)) fail(`GEM CENSUS L3: '${r.id}' has unknown status '${r.status}'.`);
    if (r.status === 'wired' && !r.verb) {
      fail(`GEM CENSUS L3: '${r.id}' is 'wired' and names no verb. "Wired" without a verb is a `
        + 'claim nobody can check.');
    }
    if (r.status === 'deferred' && !r.blockedBy) {
      fail(`GEM CENSUS L3: '${r.id}' is 'deferred' and names no blocker. "Not yet" without a named `
        + 'dependency is indistinguishable from "forgotten" — which is how these three shipped.');
    }
    if (r.status === 'none' && !r.why) {
      fail(`GEM CENSUS L3: '${r.id}' is 'none' and says nothing about why it is exempt.`);
    }
  }

  // ── L4: a named verb is one the server implements ────────────────────────
  const serverVerbs = new Set([
    ...(request.VERBS ? Array.from(request.VERBS) : []),
    ...Array.from(goalClaimSrc.matchAll(/call\(\s*'([a-z_]+)'/g), (m) => m[1]),
  ]);
  for (const r of LEDGER) {
    if (r.status !== 'wired' || !r.verb) continue;
    if (!serverVerbs.has(r.verb)) {
      fail(`GEM CENSUS L4: '${r.id}' claims verb '${r.verb}', which is not in the Edge Function's `
        + 'VERBS nor called by src/net/goal-claim.js. A wired row naming a verb that does not exist '
        + 'is the most expensive kind of wrong: it reads as done.');
    }
  }

  // ── L5: every client-authored MOVEMENT of the armed balance is gated ─────
  let probed = 0;
  for (const r of LEDGER) {
    if (r.status === 'wired') continue;
    if (r.kind !== 'spend' && r.kind !== 'grant') continue;
    const site = found.get(r.id);
    if (!site) continue;                 // already reported by L2
    if (!r.armGuard || !r.armGuard.gated) {
      fail(`GEM CENSUS L5: '${r.id}' is an unwired ${r.kind} of the ARMED gems balance and carries `
        + 'no armGuard. THIS IS THE DEFECT CLASS: buyTheme / buyCosmetic / buyBankSpaceGem each did '
        + '`G.gems -= price` with no arm check and no server call, so the gems were refunded by the '
        + 'next envelope and the purchase became free. Add `armGuard: { gated: \'<token>\' }` naming '
        + 'the real check in the code, or wire the site to a server verb.');
      continue;
    }
    const where = r.armGuard.where || site.fn;
    const has = await armTokenInBody(site.file, where, r.armGuard.gated);
    probed++;
    if (has === null) {
      fail(`GEM CENSUS L5: '${r.id}' claims armGuard token '${r.armGuard.gated}' in `
        + `${site.file}#${where}, and that function body could not be resolved, so the claim could `
        + 'not be verified. An unverifiable guard is treated as broken, not as a pass.');
    } else if (!has) {
      fail(`GEM CENSUS L5: '${r.id}' claims armGuard token '${r.armGuard.gated}' but it does not `
        + `appear as code in ${site.file}#${where}. The annotation is a claim; this is the check. `
        + 'Either the gate was removed (a live free-gems regression) or the row is lying.');
    }
  }
  if (probed === 0) {
    fail('GEM CENSUS L5: not one armGuard was source-probed. Either every gem movement is now '
      + 'wired to a server verb (delete this control and say so) or L5 stopped selecting rows and '
      + 'has been passing for free.');
  }

  /* ── L7: THE DELEGATION IS A CHECK, NOT A COMMENT ─────────────────────────
     This census does not scan `Object.assign(G,…)` or a computed member write
     because the gold census matches both by RECEIVER and therefore already sees
     a gem write through either. That is only true while those patterns are
     still in ITS set. If one is renamed or removed, the shape stops being
     covered ANYWHERE and nothing else in the tree would notice. */
  try {
    /* ⚠ `bust` IS LOAD-BEARING HERE AND ITS ABSENCE MADE THIS CHECK ABOUT
       ITSELF. The first version imported the gold census without it; the M6
       mutation renamed `assignBulk` there, and L7 read the module Node had
       already cached from the baseline run — so the pattern was "still present"
       and M6 escaped GREEN. The exact failure the b499 lesson names: a guard
       that searches for evidence must be told where evidence may not come from,
       and the first mutation to run is always "make the thing the guard
       forbids, and watch it stay green." */
    const goldCensus = await import(mod('tests/gold-site-census.mjs') + bust);
    const goldNames = new Set((goldCensus.PATTERNS || []).map((p) => p.name));
    for (const [name, what] of Object.entries(DELEGATED_TO_GOLD_CENSUS)) {
      if (!goldNames.has(name)) {
        fail(`GEM CENSUS L7: this census delegates '${name}' to tests/gold-site-census.mjs and that `
          + `pattern is no longer in its set. The shape it covered — ${what} — is now scanned by `
          + 'NOTHING. Either restore it there or add it to PATTERNS here.');
      }
    }
  } catch (e) {
    fail('GEM CENSUS L7: tests/gold-site-census.mjs could not be loaded, so the two delegated '
      + 'evasion shapes could not be confirmed covered: ' + (e && e.message));
  }

  // ── L6: THE CONTROL ──────────────────────────────────────────────────────
  const blinded = PATTERNS.map((p) => p.name).filter((n) => n !== 'compound');
  const { count: blindCount } = await census(blinded);
  const full = sites.length;
  if (!(blindCount < full && blindCount > 0)) {
    fail(`GEM CENSUS L6 (control): blinding the 'compound' pattern moved the count ${full} -> `
      + `${blindCount}. It must fall (the scanner is really using that pattern) and must stay above `
      + 'zero (a scanner that reports 0 also "drops"). Neither held, so every assertion above '
      + 'passed for free.');
  }

  const byStatus = (s) => LEDGER.filter((r) => r.status === s).length;
  return {
    problems,
    note: `${full} gem write sites in src/** (control: ${blindCount} when blinded); `
      + `${byStatus('wired')} wired, ${byStatus('deferred')} deferred, ${byStatus('none')} exempt; `
      + `${probed} arm guards source-probed`,
  };
}

// ── --report ────────────────────────────────────────────────────────────────
async function report() {
  const { sites } = await census();
  let LEDGER = [];
  try { LEDGER = (await import(mod('src/net/gem-sites.js'))).GEM_SITE_LEDGER; } catch (e) { /* pre-ledger */ }
  const byId = new Map(LEDGER.map((r) => [r.id, r]));
  console.log(`\n${sites.length} gem write sites\n`);
  for (const s of sites) {
    const r = byId.get(s.id);
    console.log(`${r ? (r.kind + '/' + r.status).padEnd(18) : '** UNDECLARED **  '} ${s.id}`);
    console.log(`   ${s.file}:${s.line} [${s.pattern}]  ${s.text}`);
  }
}

// ── --selftest: every planted defect must turn the guard RED ───────────────
const PROBE_FILE = 'src/features/_gem_census_probe.js';
async function selftest() {
  const mutations = [
    {
      name: 'M1 — the arm gate is removed from buyTheme (THE SHIPPED BUG, reinstated)',
      why: 'the exact defect this lane fixes: `G.gems -= t.price` with no arm check. If the census '
        + 'stays green with the gate deleted, L5 is decorative.',
      apply: async () => {
        const p = at('src/legacy.js');
        const s = await readFile(p, 'utf8');
        const gate = "    if(!gemSpendIsClientAuthored()){refuseGemPurchase('that theme');return;}\n";
        if (!s.includes(gate)) throw new Error('M1 anchor not found — buyTheme gate has moved');
        await writeFile(p, s.replace(gate, ''), 'utf8');
        return () => writeFile(p, s, 'utf8');
      },
    },
    {
      name: 'M2 — a brand-new file acquires a raw `G.gems -=`',
      why: 'this is how every gem site got here in the first place. A new file must not be able to '
        + 'move the premium balance without a ledger row.',
      apply: async () => {
        await writeFile(at(PROBE_FILE), 'export function probeSpend(G){ G.gems -= 1; }\n', 'utf8');
        return () => rm(at(PROBE_FILE), { force: true });
      },
    },
    {
      name: 'M3 — a ledger row is deleted while its site still exists',
      why: 'the census must not be satisfiable by quietly shrinking the ledger.',
      /* ⚠ THE FIRST VERSION OF THIS MUTATION WAS A FALSE RED and it is worth
         keeping the lesson. It cut from `lastIndexOf('{')` to the next `'},'`,
         and the next `'},'` landed inside a `why:` string — so the ledger no
         longer PARSED and the census reported "the ledger could not be loaded".
         RED, and completely uninformative: it proved the guard notices a broken
         file, which was never in doubt, and proved nothing about L1. A mutation
         must plant a DEFECT, not a syntax error. Rows are delimited by a `\n  },`
         at exactly two spaces of indent, so cut to that. */
      apply: async () => {
        const p = at('src/net/gem-sites.js');
        const s = await readFile(p, 'utf8');
        const i = s.indexOf("id: 'src/legacy.js#buyCosmetic'");
        if (i < 0) throw new Error('M3 anchor not found');
        const start = s.lastIndexOf('\n  {', i);
        const end = s.indexOf('\n  },', i);
        if (start < 0 || end < 0) throw new Error('M3 row boundaries not found');
        const cut = s.slice(0, start) + s.slice(end + '\n  },'.length);
        /* The mutation must leave a file that still parses, or it is measuring
           itself. Prove it before handing it to the census. */
        await writeFile(p, cut, 'utf8');
        try { await import(mod('src/net/gem-sites.js') + `?m3=${Date.now()}`); }
        catch (e) { await writeFile(p, s, 'utf8'); throw new Error('M3 produced an unparseable ledger: ' + e.message); }
        return () => writeFile(p, s, 'utf8');
      },
    },
    {
      name: 'M4 — a ledger row names a site that does not exist',
      why: 'a stale row describes a codebase nobody is running; L2 must say so.',
      apply: async () => {
        const p = at('src/net/gem-sites.js');
        const s = await readFile(p, 'utf8');
        const anchor = 'export const GEM_SITE_LEDGER = Object.freeze([';
        if (!s.includes(anchor)) throw new Error('M4 anchor not found');
        const row = anchor + "\n  { id: 'src/legacy.js#thisFunctionWasDeletedInB404', kind: 'spend', "
          + "status: 'none', why: 'a ghost row planted by --selftest' },";
        await writeFile(p, s.replace(anchor, row), 'utf8');
        return () => writeFile(p, s, 'utf8');
      },
    },
    {
      name: 'M5 — an armGuard names a token that is not in the gating function',
      why: 'the annotation must be a CHECK, not a claim. A row that says "gated" and is not must be '
        + 'as red as a row with no guard at all.',
      apply: async () => {
        const p = at('src/net/gem-sites.js');
        const s = await readFile(p, 'utf8');
        if (!s.includes("gated: 'gemSpendIsClientAuthored'")) throw new Error('M5 anchor not found');
        await writeFile(p, s.replace("gated: 'gemSpendIsClientAuthored'",
          "gated: 'aTokenThatIsNowhereInTheSource'"), 'utf8');
        return () => writeFile(p, s, 'utf8');
      },
    },
    {
      name: 'M6 — the gold census drops a pattern this one DELEGATES to it',
      why: 'the delegation of `Object.assign(G,…)` and computed writes is the reason those shapes '
        + 'are not scanned here. If it can be broken silently it is not a delegation, it is a gap. '
        + 'This mutation deletes the pattern THERE and requires the failure to surface HERE — the '
        + 'only place that knows the two files are load-bearing for each other.',
      apply: async () => {
        const p = at('tests/gold-site-census.mjs');
        const s = await readFile(p, 'utf8');
        const anchor = "{ name: 'assignBulk',";
        if (!s.includes(anchor)) throw new Error('M6 anchor not found in the gold census');
        await writeFile(p, s.replace(anchor, "{ name: 'assignBulkRENAMED',"), 'utf8');
        return () => writeFile(p, s, 'utf8');
      },
    },
  ];

  let bad = 0;
  const base = await runAll({ bust: true });
  if (base.problems.length) {
    console.log('SELFTEST ABORTED: the census is already RED on a clean tree:');
    for (const p of base.problems) console.log('  ✗ ' + p);
    return 1;
  }
  console.log('baseline: GREEN — ' + base.note + '\n');
  for (const m of mutations) {
    let undo = null;
    try {
      undo = await m.apply();
      const r = await runAll({ bust: true });
      const red = r.problems.length > 0;
      console.log(`${red ? 'RED  ' : 'GREEN'}  ${m.name}`);
      if (red) console.log('       → ' + r.problems[0].slice(0, 150));
      if (!red) { bad++; console.log('       ⚠ ESCAPED. ' + m.why); }
    } catch (e) {
      bad++; console.log(`ERROR  ${m.name}: ${e && e.message}`);
    } finally { if (undo) await undo(); }
  }
  const after = await runAll({ bust: true });
  if (after.problems.length) {
    bad++;
    console.log('\n⚠ THE TREE WAS NOT RESTORED — the census is RED after the selftest:');
    for (const p of after.problems) console.log('  ✗ ' + p);
  }
  console.log(bad === 0 ? '\nselftest OK — every planted defect turned the census RED'
    : `\nselftest FAILED — ${bad} problem(s)`);
  return bad === 0 ? 0 : 1;
}

/* The gold census's isMain, verbatim: a bare `import.meta.url === file://argv[1]`
   compare is WRONG on this repo's own path — "R:\the game\the game" percent-
   encodes its spaces in the URL and does not in argv, so the file silently ran
   as a no-op. Measured. */
const isMain = process.argv[1] && fileURLToPath(new URL(`file://${process.argv[1]}`).href)
  .replace(/\\/g, '/').endsWith('gem-site-census.mjs');
if (isMain) {
  const arg = process.argv[2];
  if (arg === '--report') { await report(); }
  else if (arg === '--selftest') { process.exit(await selftest()); }
  else {
    const r = await runAll();
    if (r.problems.length) {
      console.log('\nGem-site census — FAILED:');
      for (const p of r.problems) console.log('  ✗ ' + p);
      process.exit(1);
    }
    console.log('\nOK — ' + r.note);
  }
}
