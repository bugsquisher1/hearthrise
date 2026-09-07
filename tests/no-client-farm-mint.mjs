// ============================================================================
// tests/no-client-farm-mint.mjs — THE FARM GESTURES MAY NOT AUTHOR AN OUTCOME.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// The b454 cutover (2026-08-22) armed FARM_SERVER_ARM_ENABLED and routed every
// farm gesture to hr_farm_plant / hr_farm_water / hr_farm_harvest /
// hr_farm_upgrade_plot. It did NOT delete the client-authored twin underneath:
// for 60 builds plantCrop/waterPlot/waterAllPlots/harvestPlot/upgradePlot each
// carried a second, unreachable copy of the farm's whole ruleset — the seeded
// yield roll, the farmYield perk, the perennial regrow ladder, the seed debit,
// the watering window, the deed/gold spend and the plot_level write.
//
// That twin is the exact shape the cutover exists to close. It is reachable from
// a console in one line, it is what a reader "fixes" when the farm misbehaves,
// and b462 ("i water plants, they go back to being dry") was one call site that
// had simply been forgotten when the routing landed. Cleanup slice 4 (b514)
// deleted it. This guard is what stops it coming back a line at a time.
//
// ── WHAT IT ASSERTS ─────────────────────────────────────────────────────────
//   A1  inside the five gesture functions, NO client-authored value movement:
//       no removeItem( / addItem( / addXp( / updateDaily( / updateQuest( /
//       G.gold = / G.plotLevels = / a client-rolled yield. The RECONCILE-DEPS
//       object literal (`var deps = { addItem, removeItem, addXp, setGold }`) is
//       excised before the scan: it is by definition the injection point through
//       which the SERVER's returned numbers are applied, and tests/farm-sync.mjs
//       proves it applies them exactly once.
//   A2  the farm arm has no override seam (`__setFarmServerArm`) and
//       `isFarmServerArmed` has no branch — a predicate that can be false is a
//       fall-through that can be reintroduced.
//   A3  THE CONTROL (--selftest). Each rule is re-run against a synthetic source
//       that DOES mint, and the guard must report exactly it. A guard that has
//       never been red is not a guard.
//
// Deliberately NOT asserted: what the RECONCILER does. reconcileFarmResult in
// src/net/farm-sync.js credits produce/XP/seed from the SERVER's response and is
// meant to call addItem/addXp — that is the point. It is proven separately by
// tests/farm-sync.mjs. This guard reads the GESTURE side only.
//
// Usage:  node tests/no-client-farm-mint.mjs [--selftest]
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The gestures that may only send an intent, and where they live. */
const GESTURES = [
  ['src/legacy.js', 'plantCrop'],
  ['src/legacy.js', 'waterPlot'],
  ['src/legacy.js', 'waterAllPlots'],
  ['src/legacy.js', 'harvestPlot'],
  ['src/features/farm-progression.js', 'upgradePlot'],
];

/** A client-authored value movement, named so the failure says WHICH mint. */
const MINTS = [
  [/\bremoveItem\s*\(/, 'removeItem( — a client-side debit (the seed / the deed)'],
  [/\baddItem\s*\(/, 'addItem( — client-minted produce'],
  [/\baddXp\s*\(/, "addXp( — client-authored farming XP"],
  [/\bupdateDaily\s*\(/, 'updateDaily( — a client-advanced goal counter'],
  [/\bupdateQuest\s*\(/, 'updateQuest( — a client-advanced quest counter'],
  [/\bG\.gold\s*=/, 'G.gold = — a client-authored balance'],
  [/\bG\.plotLevels\s*=/, 'G.plotLevels = — a client-authored plot tier (residue-ahead)'],
  [/\bG\.stats\.(planted|harvested)\s*=/, 'G.stats.* = — a client-authored farm stat'],
  [/\brollFlatBonus\s*\(/, 'rollFlatBonus( — a client-rolled yield perk'],
];

/** Extract a function body by brace matching from `function <name>(` (or
 *  `window.<name>=function <name>(`). Returns null if the name is not found —
 *  which is itself a finding: the guard must never silently cover nothing. */
export function bodyOf(src, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index + m[0].length - 1);
  if (i < 0) return null;
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

/** Strip comments and template/quoted strings so a mint named in PROSE (this
 *  file's own comment blocks do exactly that) is never counted as code. */
export function codeOnly(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

/** Excise the reconcile-deps object literal. It names addItem/removeItem/addXp/
 *  setGold on purpose — that is how the SERVER's response reaches the cache —
 *  and reading it as a mint would only force the deps to be smuggled in under
 *  another name, which is strictly worse. Brace-matched so a nested function body
 *  cannot end it early. */
export function stripDeps(code) {
  const m = /\bdeps\s*=\s*\{/.exec(code);
  if (!m) return code;
  let depth = 0;
  const start = code.indexOf('{', m.index);
  for (let k = start; k < code.length; k++) {
    if (code[k] === '{') depth++;
    else if (code[k] === '}') { depth--; if (depth === 0) return code.slice(0, start) + '{}' + code.slice(k + 1); }
  }
  return code;
}

export function auditSources(sources, gestures = GESTURES) {
  const findings = [];
  let covered = 0;
  for (const [file, name] of gestures) {
    const src = sources[file];
    if (src === undefined) { findings.push(`${file}: not found — the guard covered nothing`); continue; }
    const body = bodyOf(src, name);
    if (body === null) {
      findings.push(`${file}: ${name}() not found. It was renamed or removed; re-point this guard `
        + 'rather than letting it pass vacuously.');
      continue;
    }
    covered++;
    const code = stripDeps(codeOnly(body));
    for (const [re, what] of MINTS) {
      if (re.test(code)) {
        findings.push(`${file} ${name}(): ${what}. Farm outcomes are hr_farm_*'s — send the intent and `
          + 'let reconcileFarmResult apply the SERVER\'s number once (src/net/farm-sync.js).');
      }
    }
  }
  return { findings, covered };
}

/** A2 — the arm may not become a fork again. */
export function auditArm(sources) {
  const findings = [];
  const ia = sources['src/data/item-authority.js'];
  if (ia === undefined) return ['src/data/item-authority.js: not found'];
  const iaCode = codeOnly(ia);
  if (/__setFarmServerArm/.test(iaCode)) {
    findings.push('src/data/item-authority.js: the farm arm OVERRIDE SEAM (__setFarmServerArm) is back. '
      + 'It can only select a branch that no longer exists, so a caller that disarms silently drops the '
      + 'gesture instead of falling through. A farm kill switch is a SERVER one.');
  }
  const body = bodyOf(ia, 'isFarmServerArmed');
  if (body === null) findings.push('src/data/item-authority.js: isFarmServerArmed() not found.');
  else if (!/^\{\s*return\s+FARM_SERVER_ARM_ENABLED\s*;\s*\}$/.test(codeOnly(body).trim())) {
    findings.push('src/data/item-authority.js: isFarmServerArmed() is no longer a bare '
      + '`return FARM_SERVER_ARM_ENABLED;`. A predicate with a branch is a fall-through waiting to be '
      + `reintroduced. Body: ${body.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  return findings;
}

function loadSrc() {
  const out = {};
  const files = new Set([...GESTURES.map(([f]) => f), 'src/data/item-authority.js']);
  for (const f of files) out[f] = readFileSync(new URL(f, new URL('file://' + ROOT.replace(/\\/g, '/'))), 'utf8');
  return out;
}

// ── A3 THE CONTROL ──────────────────────────────────────────────────────────
function selftest() {
  let bad = 0;
  const check = (what, ok, extra) => {
    console.log(`  ${ok ? '✓' : '✗'} ${what}`);
    if (!ok) { bad++; if (extra) console.log('      ' + extra); }
  };

  // Each mint, one at a time, in a synthetic gesture.
  const mints = [
    ['a seed debit', "  removeItem(seedId,1);"],
    ['minted produce', "  addItem(crop.prod,qty);"],
    ['client XP', "  addXp('farming',28);"],
    ['a goal counter', "  updateDaily('harvest',qty);"],
    ['a gold write', "  G.gold = G.gold - price.gold;"],
    ['a plot-tier write', "  G.plotLevels = price.level;"],
    ['a yield roll', "  const b = rollFlatBonus(getBonus('farmYield'));"],
  ];
  for (const [what, line] of mints) {
    const src = { 'fake.js': `function plantCrop(i,c){\n${line}\n}\n` };
    const { findings } = auditSources(src, [['fake.js', 'plantCrop']]);
    check(`bites: ${what}`, findings.length === 1, findings.join(' | '));
  }

  // The negative control: the shipped shape produces nothing…
  {
    const src = {
      'fake.js': "function plantCrop(i,c){\n  /* the old body called removeItem(seedId,1) and addXp('farming',28) */\n"
        + "  if(!hasItem(seedId)){ notify('You have no '+_sn,'kill'); return; }\n  farmSyncPlant(i,c);\n}\n",
    };
    const { findings, covered } = auditSources(src, [['fake.js', 'plantCrop']]);
    check('passes: an intent-only gesture (with the old mints named in PROSE and in a string)',
      findings.length === 0 && covered === 1, findings.join(' | '));
  }

  // …and a renamed gesture must FAIL rather than pass vacuously.
  {
    const { findings } = auditSources({ 'fake.js': 'function nope(){}' }, [['fake.js', 'plantCrop']]);
    check('bites: a renamed/removed gesture (never passes vacuously)',
      findings.length === 1 && /not found/.test(findings[0]), findings.join(' | '));
  }

  // A2 controls.
  check('bites: the override seam returning',
    auditArm({ 'src/data/item-authority.js': 'export function __setFarmServerArm(v){}\n'
      + 'export function isFarmServerArmed(){ return FARM_SERVER_ARM_ENABLED; }' }).length === 1);
  check('bites: a branching arm predicate',
    auditArm({ 'src/data/item-authority.js': 'export function isFarmServerArmed(){ return window.__off ? false : FARM_SERVER_ARM_ENABLED; }' }).length === 1);
  check('passes: the constant arm',
    auditArm({ 'src/data/item-authority.js': 'export function isFarmServerArmed() {\n  return FARM_SERVER_ARM_ENABLED;\n}' }).length === 0);

  // The vacuity control: the REAL tree must actually be covered.
  {
    const { covered } = auditSources(loadSrc());
    check(`not vacuous: ${covered}/${GESTURES.length} real gestures located`, covered === GESTURES.length);
  }

  if (bad) { console.error(`no-client-farm-mint --selftest: ${bad} control(s) failed.`); process.exit(1); }
  console.log('no-client-farm-mint --selftest: all controls green.');
  process.exit(0);
}

const argv = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  if (argv.includes('--selftest')) selftest();
  const sources = loadSrc();
  const { findings, covered } = auditSources(sources);
  const all = findings.concat(auditArm(sources));
  if (all.length) {
    console.error(`no-client-farm-mint — ${all.length} client-authored farm write(s):`);
    for (const f of all) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`no-client-farm-mint — ${covered} farm gesture(s) send an INTENT and author nothing; `
    + 'the arm is a constant with no override seam.');
  process.exit(0);
}
