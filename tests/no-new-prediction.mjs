#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/no-new-prediction.mjs — THE CLIENT-PREDICTION SURFACE MAY ONLY SHRINK.
//
//   node tests/no-new-prediction.mjs             # the ratchet
//   node tests/no-new-prediction.mjs --list      # the census, itemised
//   node tests/no-new-prediction.mjs --selftest  # the mutation proof
//   node tests/no-new-prediction.mjs --json
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// Decision (Tyler, 2026-09-16, docs/planning/LIVE_WORLD_BRIEF.md): Hearthrise
// moves to a server world-tick plus a push channel. The client becomes a window
// that APPLIES pushed envelopes and predicts nothing. From that date no new
// client-prediction or reconciliation code is written — such work is built on
// the tick or waits for it.
//
// The existing surface (src/net/predict.js, the display accessors it feeds, and
// the reconcilers in src/net that exist to undo it) is not deleted today: it is
// retired channel by channel as the tick takes each one over
// (docs/planning/CLIENT_PREDICTION_RETIREMENT.md). A dated ruling with no
// executable form is a ruling that decays — b455 added predict.js for good
// reasons, and every later "one more predicted field" also had good reasons.
// So the ruling is a RATCHET: the census below may fall, never grow.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//   PRED-1  CALL SITES. The number of prediction/display-accessor call sites in
//           src/** (outside the suite) may only fall. A new one is a review.
//   PRED-2  PREDICTED FIELDS. The exact set of fields predict.js is willing to
//           predict — PREDICTED_BALANCE_FIELDS plus the CLEARS retirement map —
//           is frozen. A new member is the "one more predicted field" move the
//           ruling forbids; a removal is a paydown and must be recorded here.
//   PRED-3  MODULE SURFACE. predict.js's exported symbol count may only fall.
//   PRED-4  RECONCILERS. The exact set of exported `reconcile*` functions in
//           src/net/** is frozen. Reconciliation is the other half of
//           prediction: every reconciler exists because some client-held number
//           can disagree with the server's. New ones are what the ruling stops.
//   PRED-5  NON-VACUITY. The real tree must actually be read: the registry
//           files must exist and each census must be non-trivially populated,
//           so a moved file or a renamed API cannot quietly zero the guard.
//   PRED-6  THE CONTROL (--selftest). A planted predicted field, a planted call
//           site and a planted reconciler must each go RED; prose and strings
//           naming the API must NOT; and the clean tree must be GREEN.
//
// ── WHAT IT DELIBERATELY DOES NOT ASSERT ────────────────────────────────────
// It does not judge whether a given prediction is sound (predict.js's coverage
// rule is correct and is tested elsewhere), and it does not touch src/core/**:
// those engines are dual-runtime and are the code the TICK will run, not client
// prediction. Driving them from a browser timer is prediction; the engines are
// not. Likewise the residue allowlist (src/net/client-state.js RESIDUE_FIELDS)
// is client-only preference state, is guarded by its own tests, and is out of
// scope here.
//
// Exit: 0 green · 1 the ratchet moved the wrong way · 2 harness failure
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/* ── THE REGISTRY ───────────────────────────────────────────────────────────
   The prediction API, named rather than pattern-guessed, so that renaming a
   function does not silently empty the census (PRED-5 is the backstop). */
const PREDICT_MODULE = 'src/net/predict.js';

const PREDICT_API = [
  'predictXp', 'predictBalance', 'predictionBag',
  'predictedXp', 'predictedXpMap', 'predictedBalance',
  'hrPredictXp',                       // legacy.js's wrapper onto predictXp
  'retirePredictions', 'resetPredictions', 'hasPredictions', 'predictionState',
  'coverageBoundary',                  // the retire-boundary computation
  'reconcileCreditedXp', 'reconcilePredictions',
];

/* The display accessors are counted by SHAPE rather than by name: `*ForDisplay`
   is the established convention for "server truth + prediction" (balance.js
   balanceForDisplay, skill-record.js skillXpForDisplay). A new one is a new
   predicted surface even when it never calls predict.js directly. */
const DISPLAY_ACCESSOR_RE = /\b[A-Za-z_$][\w$]*ForDisplay\s*\(/g;

/* The suite drives these on purpose to assert on them; counting it would make
   the ratchet a measure of how much we test (the no-client-xp-mint rule). */
const EXCLUDED = [
  'src/features/smoke-test.js',
  'src/features/smoke/',
];

/* ── THE BASELINE (measured on the tree of 2026-09-16, build b545) ──────────
   Every number here may FALL as the tick takes a channel over. Lowering it is
   the paydown; raising it is a decision that needs Tyler's ruling reversed. */
const BASELINE = {
  sites: 35,
  predictExports: 19,
  fields: ['gems', 'gold', 'skills'],
  reconcilers: [
    'src/net/accrue.js:reconcileAwayReceipt',
    'src/net/accrue.js:reconcileBank',
    'src/net/accrue.js:reconcileBankRungs',
    'src/net/accrue.js:reconcileBuffs',
    'src/net/accrue.js:reconcileCombatStyle',
    'src/net/accrue.js:reconcileCompanions',
    'src/net/accrue.js:reconcileDungeonCooldowns',
    'src/net/accrue.js:reconcileEventCounters',
    'src/net/accrue.js:reconcileFall',
    'src/net/accrue.js:reconcileFarm',
    'src/net/accrue.js:reconcileGemUnlocks',
    'src/net/accrue.js:reconcileHeroSlots',
    'src/net/accrue.js:reconcileHp',
    'src/net/accrue.js:reconcileInventory',
    'src/net/accrue.js:reconcilePlayStreak',
    'src/net/accrue.js:reconcileRecipes',
    'src/net/accrue.js:reconcileToolCarry',
    'src/net/accrue.js:reconcileTraits',
    'src/net/accrue.js:reconcileWorkers',
    'src/net/dungeon-scrip-record.js:reconcileScrip',
    'src/net/dungeon-settle.js:reconcileFromEnvelope',
    'src/net/dungeon-settle.js:reconcileQuartermasterFromEnvelope',
    'src/net/farm-sync.js:reconcileFarmResult',
    'src/net/gold.js:reconcilePredictions',
    'src/net/item-ledger.js:reconcile',
    'src/net/predict.js:reconcileCreditedXp',
  ],
};

// ── READING THE TREE ────────────────────────────────────────────────────────

/** Blank out comments and string/template CONTENTS, preserving line structure,
 *  so prose and copy that name the API are not counted as call sites.
 *
 *  ⚠ WRITTEN AS A SCANNER, NOT AS REGEXES, AND THAT IS LOAD-BEARING. The first
 *  draft dropped comment LINES and then blanked quoted spans with three regexes.
 *  It under-counted by nine real call sites (src/net/record.js and src/legacy.js
 *  both vanished entirely), because this codebase's block comments are written
 *  `/* … \n   continued prose …` — the continuation lines do not start with a
 *  comment marker, so an apostrophe in "the server's" opened a fake string span
 *  that swallowed every line up to the next apostrophe, real code included. A
 *  ratchet that silently measures nothing is worse than no ratchet, so the
 *  scanner consumes comments FIRST and PRED-5 is the floor under it. */
export function codeOf(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {                       // line comment
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && d === '*') {                       // block comment
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += (src[i] === '\n' ? '\n' : ' '); i++; }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {          // string / template
      const quote = c;
      out += quote; i++;
      while (i < n) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === quote) { out += quote; i++; break; }
        // A single/double-quoted string cannot span a newline: an unterminated
        // one is a scanning artefact, so give the line back rather than eating it.
        if (src[i] === '\n' && quote !== '`') { out += '\n'; i++; break; }
        out += (src[i] === '\n' ? '\n' : ' '); i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** Every prediction call site in one file, as {line, name}. A DEFINITION is not
 *  a site (that is PRED-3's business), so `function predictXp(` and
 *  `export function predictXp(` are skipped. */
export function sitesIn(file, src) {
  const out = [];
  const lines = codeOf(src).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const name of PREDICT_API) {
      /* A namespace call is a call: legacy.js reaches predict.js as
         `P.predictXp(…)` through `window.HearthrisePredict`, and a census that
         only counted bare identifiers missed every legacy.js site. */
      const re = new RegExp(`(^|[^\\w$.])(?:[A-Za-z_$][\\w$]*\\.)?${name}\\s*\\(`, 'g');
      let m;
      while ((m = re.exec(line))) {
        if (/\b(function|const|let|var|class)\s*$/.test(line.slice(0, m.index + m[1].length))) continue;
        out.push({ file, line: i + 1, name });
      }
    }
    let d;
    DISPLAY_ACCESSOR_RE.lastIndex = 0;
    while ((d = DISPLAY_ACCESSOR_RE.exec(line))) {
      const before = line.slice(0, d.index);
      if (/\b(function|const|let|var|class)\s*$/.test(before)) continue;
      out.push({ file, line: i + 1, name: d[0].replace(/\s*\($/, '') });
    }
  }
  return out;
}

/** The fields predict.js is willing to predict: the balance list plus the keys
 *  of the CLEARS retirement map (a field with no CLEARS row retires nothing, so
 *  the two together are the honest set). */
export function fieldsIn(predictSrc) {
  const set = new Set();
  const bal = /PREDICTED_BALANCE_FIELDS\s*=\s*Object\.freeze\(\s*\[([^\]]*)\]/.exec(predictSrc || '');
  if (bal) for (const m of bal[1].matchAll(/'([^']+)'|"([^"]+)"/g)) set.add(m[1] || m[2]);
  const clears = /CLEARS\s*=\s*Object\.freeze\(\s*\{([\s\S]*?)\}\s*\)/.exec(predictSrc || '');
  if (clears) for (const m of clears[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) set.add(m[1]);
  return set;
}

/** Exported symbols of predict.js. */
export function exportsIn(predictSrc) {
  return [...(predictSrc || '').matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => m[1]);
}

/** Exported `reconcile*` functions across the scanned files, as file:name. */
export function reconcilersIn(sources) {
  const out = [];
  for (const [file, src] of Object.entries(sources)) {
    if (!file.startsWith('src/net/')) continue;
    for (const m of (src || '').matchAll(/^export\s+(?:async\s+)?function\s+(reconcile[A-Za-z0-9_$]*)/gm)) {
      out.push(`${file}:${m[1]}`);
    }
  }
  return out.sort();
}

/* ── THE VERDICT, as a pure function of the tree ────────────────────────────
   Everything it reads is an argument, so --selftest can hand it a MUTATED tree
   and require THIS code — the code the lane runs — to go red. */
export function verdict(sources, baseline = BASELINE) {
  const problems = [];
  const sites = [];
  for (const [file, src] of Object.entries(sources)) sites.push(...sitesIn(file, src));

  const predictSrc = sources[PREDICT_MODULE];
  const fields = [...fieldsIn(predictSrc)].sort();
  const exps = exportsIn(predictSrc);
  const recs = reconcilersIn(sources);

  // PRED-1
  if (sites.length > baseline.sites) {
    const byFile = {};
    for (const s of sites) byFile[s.file] = (byFile[s.file] || 0) + 1;
    problems.push(`PRED-1 the prediction call-site census GREW: ${sites.length} > ${baseline.sites}. `
      + 'No new client prediction is written from 2026-09-16 (LIVE_WORLD_BRIEF.md); build it on the '
      + 'world tick or wait for it. Per file: ' + JSON.stringify(byFile));
  }
  // PRED-2
  const added = fields.filter((f) => !baseline.fields.includes(f));
  const gone = baseline.fields.filter((f) => !fields.includes(f));
  if (added.length) {
    problems.push(`PRED-2 a NEW predicted field: ${added.join(', ')}. The predicted set is frozen at `
      + `[${baseline.fields.join(', ')}] until the tick retires it.`);
  }
  if (gone.length) {
    problems.push(`PRED-2 a predicted field was retired (${gone.join(', ')}) but the baseline still lists it. `
      + 'That is the paydown — record it by removing the field from BASELINE.fields in this file.');
  }
  // PRED-3
  if (exps.length > baseline.predictExports) {
    problems.push(`PRED-3 src/net/predict.js grew its exported surface: ${exps.length} > ${baseline.predictExports}.`);
  }
  // PRED-4
  const newRecs = recs.filter((r) => !baseline.reconcilers.includes(r));
  const deadRecs = baseline.reconcilers.filter((r) => !recs.includes(r));
  if (newRecs.length) {
    problems.push(`PRED-4 a NEW reconciler: ${newRecs.join(', ')}. A reconciler exists because a client-held `
      + 'number can disagree with the server\'s; the push channel is the fix, not another reconciler.');
  }
  if (deadRecs.length) {
    problems.push(`PRED-4 a reconciler is gone (${deadRecs.join(', ')}) but the baseline still lists it — `
      + 'record the paydown by removing it from BASELINE.reconcilers.');
  }
  // PRED-5 — the census must actually have read something.
  if (!predictSrc) {
    problems.push(`PRED-5 ${PREDICT_MODULE} was not read. The registry is stale, or the module moved; `
      + 'either way this guard measured nothing.');
  }
  if (sites.length < 10 || fields.length < 2 || recs.length < 10) {
    problems.push(`PRED-5 the census is implausibly small (sites=${sites.length}, fields=${fields.length}, `
      + `reconcilers=${recs.length}) — treat as a broken scan, not as a paydown.`);
  }

  return { problems, sites, fields, exports: exps, reconcilers: recs };
}

// ── THE REAL TREE ───────────────────────────────────────────────────────────
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
export function loadSrc() {
  const dir = join(ROOT, 'src');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error('no-new-prediction: src/ not found — run me from the repo root.');
    process.exit(2);
  }
  return walk(dir, {});
}

// ── PRED-6 THE CONTROL ──────────────────────────────────────────────────────
function selftest() {
  let bad = 0;
  const check = (what, ok, extra) => {
    console.log(`  ${ok ? '✓' : '✗'} ${what}`);
    if (!ok) { bad++; if (extra) console.log('      ' + extra); }
  };
  const real = loadSrc();

  // The clean arm. A proof harness that never sees green cannot tell a caught
  // defect from its own corpse (guard-hygiene R3).
  const clean = verdict(real);
  check(`clean tree is GREEN (${clean.sites.length} sites, ${clean.fields.length} fields, `
    + `${clean.reconcilers.length} reconcilers)`, clean.problems.length === 0,
  clean.problems.join(' | '));

  // A NEW PREDICTED FIELD — the move the ruling forbids.
  {
    const mutated = { ...real };
    mutated[PREDICT_MODULE] = (real[PREDICT_MODULE] || '')
      .replace("Object.freeze(['gold', 'gems'])", "Object.freeze(['gold', 'gems', 'marks'])");
    const v = verdict(mutated);
    check('bites: a new field added to PREDICTED_BALANCE_FIELDS (PRED-2)',
      v.problems.some((p) => p.startsWith('PRED-2 a NEW predicted field: marks')), v.problems.join(' | '));
  }
  // …and through the retirement map, which is the other door into the same set.
  {
    const mutated = { ...real };
    mutated[PREDICT_MODULE] = (real[PREDICT_MODULE] || '')
      .replace('  gems: \'gems\',', '  gems: \'gems\',\n  dungeon_scrip: \'scrip\',');
    const v = verdict(mutated);
    check('bites: a new field added to the CLEARS retirement map (PRED-2)',
      v.problems.some((p) => p.includes('a NEW predicted field: dungeon_scrip')), v.problems.join(' | '));
  }
  // A NEW CALL SITE.
  {
    const mutated = { ...real, 'src/fake-feature.js': "function buyThing(){\n  predictBalance(G, 'gold', -5, Date.now());\n}\n" };
    const v = verdict(mutated);
    check('bites: a planted predictBalance() call site (PRED-1)',
      v.problems.some((p) => p.startsWith('PRED-1')), v.problems.join(' | '));
  }
  // A NEW DISPLAY ACCESSOR — prediction that never names predict.js.
  {
    const mutated = { ...real, 'src/fake-render.js': 'function paint(){ return scripForDisplay(G); }\n' };
    const v = verdict(mutated);
    check('bites: a planted *ForDisplay accessor call (PRED-1)',
      v.problems.some((p) => p.startsWith('PRED-1')), v.problems.join(' | '));
  }
  // A NEW RECONCILER.
  {
    const mutated = { ...real, 'src/net/zone-sync.js': 'export function reconcileZone(G, res) { return null; }\n' };
    const v = verdict(mutated);
    check('bites: a planted exported reconciler in src/net (PRED-4)',
      v.problems.some((p) => p.includes('reconcileZone')), v.problems.join(' | '));
  }
  // THE NEGATIVE CONTROLS: prose, copy and definitions are not new prediction.
  {
    const mutated = {
      ...real,
      'src/fake-prose.js': "/* the old path called predictXp('mining', 5) and read balanceForDisplay(G) */\n"
        + '// see predictBalance() in src/net/predict.js\n'
        + 'var msg = "predictXp(G, \'mining\', 5)";\n'
        + 'var t = `balanceForDisplay(G, \'gold\')`;\n',
    };
    const v = verdict(mutated);
    check('passes: the API named in a comment, a string and a template is NOT a call site',
      v.problems.length === 0, v.problems.join(' | '));
  }
  // A RENAME MUST NOT BE A FREE PASS: emptying the module trips PRED-5, not silence.
  {
    const mutated = { ...real };
    delete mutated[PREDICT_MODULE];
    const v = verdict(mutated);
    check('bites: predict.js gone from the scan is a BROKEN SCAN, not a paydown (PRED-5)',
      v.problems.some((p) => p.startsWith('PRED-5')), v.problems.join(' | '));
  }
  // Vacuity floor on the real tree itself.
  check(`not vacuous: ${clean.sites.length} real call site(s), ${clean.reconcilers.length} real reconciler(s)`,
    clean.sites.length >= 20 && clean.reconcilers.length >= 20);

  if (bad) { console.error(`no-new-prediction --selftest: ${bad} control(s) failed.`); process.exit(1); }
  console.log('no-new-prediction --selftest: all controls green.');
  process.exit(0);
}

// ── MAIN ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const isMain = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  if (argv.includes('--selftest')) selftest();
  const v = verdict(loadSrc());
  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      sites: v.sites.length, fields: v.fields, exports: v.exports.length,
      reconcilers: v.reconcilers, problems: v.problems,
    }, null, 2));
  } else if (argv.includes('--list')) {
    for (const s of v.sites) console.log(`${s.file}:${s.line}  ${s.name}()`);
    console.log(`\nsites=${v.sites.length}  fields=[${v.fields.join(', ')}]  `
      + `predict.js exports=${v.exports.length}  reconcilers=${v.reconcilers.length}`);
    for (const r of v.reconcilers) console.log('  reconciler  ' + r);
  }
  if (v.problems.length) {
    for (const p of v.problems) console.error('✗ ' + p);
    console.error(`\nno-new-prediction: ${v.problems.length} problem(s) — the prediction surface may only shrink.`);
    process.exit(1);
  }
  console.log(`no-new-prediction: green — ${v.sites.length} call site(s) (baseline ${BASELINE.sites}), `
    + `fields [${v.fields.join(', ')}], ${v.reconcilers.length} reconciler(s).`);
}
