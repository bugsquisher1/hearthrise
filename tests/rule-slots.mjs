#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/rule-slots.mjs — EVERY REGISTERED FAMILY OF EVERY RULE SLOT AGAINST ITS CONTRACT (Balance Lab phase 3; docs/design/redesign/
// 07-balance-lab.md section 3.2: "tools/balance-lab/model/slots.json lists the slots. tests/rule-slots.mjs runs every registered variant of a
// slot against the contract"; the registry lives beside phase 1's registers, as tools/balance-program/rule-slots.json).
//
// THE PLAIN RUN
//   RS-1  the registry reads: each slot cut (one module, rule exports, a contract) or git-ref (a seam and why); its formula is a row of
//         formulas/formulas-architecture.json, and a cut slot's row names its module
//   RS-2  the shelf: every non-shipped family is the file tools/balance-program/variants/<slot>/<slot>.<family>.js, first line
//         `// balance-variant: <slot>/<family>`; a formula family carries `added` and `expires`, and is red past its date read against
//         the commit's own date (so one commit always reads the same, and a loser cannot sit on the shelf for ever)
//   RS-3  the written contract is the checked one: each slot's contract ids are exactly tools/balance-program/slot-contracts.mjs's
//   RS-4  off the path: every shipped export that calls a rule export is a rule export or named in `offPath` (an inherited caller would
//         run the shipped rule beside a family's), and no `offPath` entry is stale
//   RS-5  EVERY FAMILY HOLDS ITS CONTRACT: the shipped module on the tree, then every copy and formula family laid by the overlay on a
//         scratch copy (matrix-scratch.mjs), each against the generic lines (surface, inherited, static) and the slot's properties
//   RS-6  every candidate manifest reads, composes and builds its patch (candidates.mjs)
//   RS-7  the real hr-accrue bundle carries no variant (tools/pack-edge.mjs variantProblems)
//
// --selftest, THE PROOFS THAT IT BITES (each on a scratch copy in the OS temp folder; no tracked file is written):
//   a planted family breaking each property of each slot is caught by that property; a drifted copy, a missing export, a clock, a table by
//   Level and a stamped import are caught by the generic lines; two variants on one slot and two candidates on one slot are refused, and
//   so are a git-ref slot's family, an identity candidate with a formula family, two overlays on one file and a ref with an overlay; a
//   knob whose line an overlay replaced is refused by name while a line edit on the overlay's own text applies; a past or missing expiry
//   is red; a copy overlay plays a cell's whole answer byte-identical while a formula family does not; pack-edge refuses the variant, its
//   side copy and a shelf path, in memory and on a scratch copy the overlay really built, and passes the same copy with none; and the
//   report's pairs and chance count (tools/balance-program/variants.mjs) read planted series right.
//
// Exit: 0 green · 1 a check or a proof failed · 2 harness.
// mutant-anchors: tools/balance-program/variants/armor/armor.hit-ratio.js tools/balance-program/variants/party-xp/party-xp.even-share.js tools/balance-program/variants/death-cost/death-cost.hours.js tools/balance-program/variants/hero-power/hero-power.step.js tools/balance-program/rule-slots.json
// ci-step: economy-selftests | Rule slots - every family of every cut slot holds its contract, candidates compose, no variant in a bundle
// ci-run: node tests/rule-slots.mjs
// ci-run: node tools/mutant-gate.mjs node tests/rule-slots.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isMain } from './_is-main.mjs';
import { readSlots, registryOf, shelfFileOf, readCandidate, listCandidates, compose, candidatePatch, checkCandidate, treeOf, markerLineOf, CANDIDATE_SCHEMA, SHELF, SLOTS_FILE } from '../tools/balance-program/candidates.mjs';
import { GENERIC, PROPERTIES, genericProblems, propertyProblems, callersOf } from '../tools/balance-program/slot-contracts.mjs';
import { PATCH_SCHEMA, plantScratch, patchEdits, checkOverlays, shippedNameOf, KnobGone, readKnobs } from '../tools/balance-program/matrix-scratch.mjs';
import { paired, aheadOf, chanceCount, groupRead, planOf, sameBytes, roleReads } from '../tools/balance-program/variants.mjs';
import { combinePatches, playJobs } from '../tools/balance-program/balance-matrix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REGISTER = 'tools/balance-program/formulas/formulas-architecture.json';
let failed = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (!ok && detail ? '\n         ' + String(detail).slice(0, 600) : '')); if (!ok) failed++; };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/* the commit's own date: a SHA's verdict never changes with the calendar */
export function commitDate() { try { return execFileSync('git', ['log', '-1', '--format=%cs'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { return null; } }

/* ── RS-1 to RS-4: the registry, the shelf, the written contract, off the path ──────────────────────────────────────────────── */
/** Problems with the registry against the formula register and the tree. */
export function registryProblems(reg, root = ROOT) {
  const out = [];
  const rows = new Map(JSON.parse(readFileSync(join(root, REGISTER), 'utf8')).formulas.map((f) => [f.id, f]));
  for (const s of reg.slots) {
    if (!existsSync(join(root, s.module))) out.push(s.id + ': its module ' + s.module + ' is not on the tree');
    const row = rows.get(s.formula);
    if (!row) { out.push(s.id + ': its formula ' + s.formula + ' is no row of ' + REGISTER); continue; }
    if (s.status === 'cut' && !JSON.stringify(row.where || '').includes(s.module)) out.push(s.id + ': its formula ' + s.formula + ' is homed at ' + row.where + ', not ' + s.module);
    if (s.status === 'git-ref' && !(s.seam && s.why)) out.push(s.id + ': a git-ref slot says what cutting it takes (`seam`) and why it is not cut (`why`)');
    if (s.status === 'cut' && !(Array.isArray(s.contract) && s.contract.length)) out.push(s.id + ': a cut slot writes its contract');
  }
  return out;
}
/** Problems with the shelf: files, first lines, dates against `today` (YYYY-MM-DD, or null to skip the expiry). */
export function shelfProblems(reg, today, root = ROOT) {
  const out = [];
  for (const { slot, family } of reg.families.values()) {
    const key = slot.id + '/' + family.id;
    if (family.kind === 'shipped') { if (family.file) out.push(key + ': the shipped family is the tree\'s own module and names no file'); continue; }
    if (!existsSync(join(root, family.file))) { out.push(key + ': no file ' + family.file); continue; }
    const head = readFileSync(join(root, family.file), 'utf8').split(/\r?\n/)[0];
    if (head !== markerLineOf(slot.id, family.id)) out.push(key + ': its first line is ' + JSON.stringify(head) + ', not ' + JSON.stringify(markerLineOf(slot.id, family.id)) + ' (tools/pack-edge.mjs refuses a bundle by it)');
    if (family.kind !== 'formula') continue;
    if (!DATE.test(family.added || '') || !DATE.test(family.expires || '')) { out.push(key + ': a formula family carries `added` and `expires` dates (YYYY-MM-DD)'); continue; }
    if (family.expires <= family.added) out.push(key + ': expires ' + family.expires + ' is not after added ' + family.added);
    if (today && family.expires < today) out.push(key + ': EXPIRED on ' + family.expires + ' (this commit is ' + today + '): move the winner into the tree and delete the loser, or extend `expires` with a reason');
  }
  /* a file on the shelf that no family names is a variant nobody registered (no contract ran on it) */
  const named = new Set([...reg.families.values()].map((x) => x.family.file).filter(Boolean));
  const shelf = join(root, SHELF);
  if (existsSync(shelf)) for (const d of readdirSync(shelf, { withFileTypes: true })) {
    const files = d.isDirectory() ? readdirSync(join(shelf, d.name)).map((f) => SHELF + d.name + '/' + f) : [SHELF + d.name];
    for (const f of files) if (!named.has(f)) out.push(f + ' is on the shelf and no family in ' + SLOTS_FILE + ' names it (register it, with its contract, or delete it)');
  }
  return out;
}
/** The written contract against the checked one. */
export function contractProblems(reg, props = PROPERTIES) {
  const out = [];
  for (const s of reg.slots.filter((x) => x.status === 'cut')) {
    const written = new Set((s.contract || []).map((c) => c.id)), checked = new Set(Object.keys(props[s.id] || {}));
    for (const id of written) if (!checked.has(id)) out.push(s.id + ': the contract says ' + id + ' and slot-contracts.mjs does not check it');
    for (const id of checked) if (!written.has(id)) out.push(s.id + ': slot-contracts.mjs checks ' + id + ', which the written contract does not say');
    for (const c of s.contract || []) if (!c.says) out.push(s.id + ' ' + c.id + ': a contract line says what it promises');
  }
  return out;
}
const importFrom = (root, p, q = '') => import(pathToFileURL(join(root, p)).href + q);
/** Off the path: the shipped module's callers of a rule export against `offPath`. */
export async function offPathProblems(reg, root = ROOT) {
  const out = [];
  for (const s of reg.slots.filter((x) => x.status === 'cut')) {
    const S = await importFrom(root, s.module);
    const callers = callersOf(S, s.rule);
    for (const [name, r] of callers) if (!Object.hasOwn(s.offPath || {}, name)) out.push(s.id + ': the shipped ' + name + ' calls the rule export ' + r + ': a family inheriting it would run the shipped rule beside its own (put it in the rule, or in offPath with why it never runs in a hunt)');
    for (const name of Object.keys(s.offPath || {})) if (!callers.some(([n]) => n === name)) out.push(s.id + ': offPath names ' + name + ', which calls no rule export (stale)');
  }
  return out;
}

/* ── RS-5: every family on its contract ──────────────────────────────────────────────────────────────────────────────────────── */
/**
 * Every family of every cut slot, loaded: [{ slot, family, M, S, src, shippedSrc, imp }]. The shipped ones from the tree; the rest in
 * ROUNDS, round k laying each slot's k-th non-shipped family by the overlay on one scratch copy. `o.keep`: the copies stay until the caller's
 * done() (a property that imports more of its copy needs it); else they are removed once the slot modules are loaded.
 */
export async function loadFamilies(reg, o = {}) {
  const out = [], copies = [];
  for (const s of reg.slots.filter((x) => x.status === 'cut')) {
    const S = await importFrom(ROOT, s.module), src = readFileSync(join(ROOT, s.module), 'utf8');
    out.push({ slot: s, family: s.families.find((f) => f.kind === 'shipped'), M: S, S, src, shippedSrc: src, imp: (p) => importFrom(ROOT, p) });
  }
  const others = (s) => [...reg.families.values()].filter((x) => x.slot.id === s.id && x.family.kind !== 'shipped').map((x) => x.family);
  const rounds = Math.max(0, ...reg.slots.filter((x) => x.status === 'cut').map((s) => others(s).length));
  for (let k = 0; k < rounds; k++) {
    const lay = reg.slots.filter((x) => x.status === 'cut' && others(x)[k]).map((s) => ({ s, f: others(s)[k] }));
    const copy = await plantScratch({ schema: PATCH_SCHEMA, name: 'rule-slots round ' + k, knobs: {}, edits: [], targets: [], overlays: lay.map(({ s, f }) => ({ file: s.module, from: f.file, slot: s.id, family: f.id })) });
    copies.push(copy);
    for (const { s, f } of lay) {
      out.push({ slot: s, family: f, M: await importFrom(copy.root, s.module), S: await importFrom(copy.root, shippedNameOf(s.module)), src: readFileSync(join(ROOT, f.file), 'utf8'),
        shippedSrc: readFileSync(join(ROOT, s.module), 'utf8'), imp: (p) => importFrom(copy.root, p), root: copy.root });
    }
  }
  const done = () => { for (const c of copies) c.done(); };
  if (!o.keep) done();
  return { families: out, done };
}
/** One family's problems: the generic lines, then the slot's properties. */
export async function familyProblems(fam) {
  const g = genericProblems(fam.M, fam.S, fam.slot.rule, fam.src, fam.shippedSrc);
  const p = await propertyProblems(fam.slot.id, fam, (fam.slot.contract || []).map((c) => c.id));
  return [...g, ...p];
}

/* ── RS-7: the bundle ────────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function bundleVariantProblems(root) {
  const P = await importFrom(root, 'tools/pack-edge.mjs');
  const { files } = await P.pack('hr-accrue');
  return { files: files.length, problems: P.variantProblems(files) };
}

async function plain() {
  console.log('rule slots (Balance Lab phase 3): the registry, the shelf, every family on its contract, the candidates, the bundle');
  let reg;
  try { reg = readSlots(); } catch (e) { check('RS-1 the registry reads', false, e.message); return 1; }
  const cut = reg.slots.filter((s) => s.status === 'cut');
  const rp = registryProblems(reg);
  check('RS-1 the registry: ' + cut.length + ' cut slots (' + cut.map((s) => s.id).join(', ') + '), ' + (reg.slots.length - cut.length) + ' git-ref, every formula a register row', !rp.length, rp.join('; '));
  const today = commitDate();
  const sp = shelfProblems(reg, today);
  check('RS-2 the shelf: ' + [...reg.families.values()].filter((x) => x.family.kind !== 'shipped').length + ' files, each named on its first line, formula families in date' + (today ? ' (this commit: ' + today + ')' : ' (no commit date: expiry not read)'), !sp.length, sp.join('; '));
  const cp = contractProblems(reg);
  check('RS-3 the written contract is the checked one (' + cut.map((s) => s.id + ' ' + s.contract.length).join(', ') + ' lines, + ' + GENERIC.length + ' generic)', !cp.length, cp.join('; '));
  const op = await offPathProblems(reg);
  check('RS-4 off the path: every shipped caller of a rule export is in the rule or offPath', !op.length, op.join('; '));
  const loaded = await loadFamilies(reg, { keep: true });
  try {
    for (const fam of loaded.families) {
      const probs = (await familyProblems(fam)).filter((x) => x.problem);
      check('RS-5 ' + fam.slot.id + '/' + fam.family.id + ' (' + fam.family.kind + ') holds its contract', !probs.length, probs.map((x) => x.id + ': ' + x.problem).join('; '));
    }
  } finally { loaded.done(); }
  const ids = listCandidates();
  const bad = [];
  for (const id of ids) { try { candidatePatch(readCandidate(id, reg), reg); } catch (e) { bad.push(id + ': ' + e.message); } }
  check('RS-6 every candidate reads and builds its patch (' + ids.join(', ') + ')', ids.length > 0 && !bad.length, bad.join('; ') || 'no manifests');
  const b = await bundleVariantProblems(ROOT);
  check('RS-7 the hr-accrue bundle (' + b.files + ' files) carries no variant', b.files > 0 && !b.problems.length, b.problems.join('; '));
  return failed ? 1 : 0;
}

/* ── THE PROOFS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/* [slot, property or generic line it must trip, the anchor in the formula family's file, the planted text] */
const MUTANTS = [
  ['armor', 'neverAdds', 'return Math.max(1, x);', 'return Math.max(1, x) + 1;'],
  ['armor', 'biggerBlowNoLess', 'if (armorPm) x = temperedAmount', 'if (raw > 1000 && m !== NO_MITIGATION) x = Math.floor(x / 100);\n  if (armorPm) x = temperedAmount'],
  ['armor', 'moreArmorNoMore', 'x -= Math.max(0, m.ward || 0);', 'x += Math.max(0, m.ward || 0);'],
  ['armor', 'harderAttackerNoLess', 'levelLine(ARMOUR_MITIGATION.dodge, nat(v.medium), L)', 'levelLine(ARMOUR_MITIGATION.dodge, nat(v.medium) * L, 1)'],
  ['armor', 'noDrawWithoutTemper', 'const raw = Math.max(0, Math.floor(n));', 'const raw = Math.max(0, Math.floor(n)); if (rng) rng.chance(0.5);'],
  ['armor', 'profileShape', 'ward, keepPm: 0, heavy', 'ward, keepPm: -1, heavy'],
  ['armor', 'noArmorIsNone', 'let x = raw - Math.floor', 'let x = (m === NO_MITIGATION ? raw - 1 : raw) - Math.floor'],
  ['armor', 'deterministic', 'const HIT_K = 0.5;', 'const HIT_K = 0.5; let calls = 0;\nconst tick = () => calls++ % 2;', 'ward, keepPm: 0, heavy', 'ward: ward + tick(), keepPm: 0, heavy'],
  ['armor', 'static', 'const HIT_K = 0.5;', 'const HIT_K = 0.5; const BY_LEVEL = [0, 1]; const pick = (level) => BY_LEVEL[level];'],
  ['armor', 'static', 'const HIT_K = 0.5;', 'const HIT_K = 0.5 + Math.random() * 0;'],
  /* a stamped import, built from two halves so the repo's own ?v= scans (tools/pack-edge.mjs versionQueryGuard) never read it as one */
  ['armor', 'static', "from '../data/core-model.js';", "from '../data/core-model.js" + '?' + "v=9.9.9';"],
  ['armor', 'inherited', 'const HIT_K = 0.5;', 'const HIT_K = 0.5;\nexport const steadyPmOf = () => 0;'],
  ['armor', 'surface', "export * from './mitigation.shipped.js';", "export { steadyPmOf, NO_MITIGATION } from './mitigation.shipped.js';"],
  ['party-xp', 'orderFree', 'return { permille: PARTY_PAY,', "return { permille: PARTY_PAY + (roles[0] === 'tank' ? 1 : 0),"],
  ['party-xp', 'classesShared', 'classes: shippedReading(roles).classes };', 'classes: shippedReading(roles).classes.slice(1) };'],
  ['party-xp', 'payShape', 'return { permille: PARTY_PAY,', 'return { permille: roles.length > 50 ? 0 : PARTY_PAY,'],
  ['party-xp', 'moreClassesNoLess', 'return { permille: PARTY_PAY,', 'return { permille: PARTY_PAY - 10 * shippedReading(roles).classes.length,'],
  ['party-xp', 'deterministic', 'const PARTY_PAY = 1000;', 'let PARTY_PAY = 1000;', 'return { permille: PARTY_PAY,', 'return { permille: PARTY_PAY++,'],
  ['death-cost', 'neverUnderLevel1', 'return Math.max(0, Math.min(hours, x));', 'return Math.max(0, hours);'],
  ['death-cost', 'oneReader', 'if (lv > 0) out.level = lv;', 'if (lv > 0) out.level = lv + 1;'],
  ['death-cost', 'freeModeFree', 'if (!(f > 0)) return 0;', 'if (!(f > 0)) return Math.min(1, x);'],
  ['death-cost', 'levelMonotone', 'contractXpPerH(charLevelFromXp(x))', 'contractXpPerH(Math.max(1, 1000 - charLevelFromXp(x)))'],
  ['death-cost', 'shareMonotone', '(f / DEATH_XP_LOSS)', '(DEATH_XP_LOSS / f)'],
  ['death-cost', 'skillKeepsLevel', 'const n = skillDeathLoss(k, state && state.skills ? state.skills[k] : 0, fraction);', 'const n = (state && state.skills ? state.skills[k] : 0) || 0;'],
  ['death-cost', 'lossShape', 'return out;\n}', 'out.gold = 1;\n  return out;\n}'],
  ['hero-power', 'pmShape', 'return shippedBlowsPm(equipment, items, temper) +', 'return -1 + shippedBlowsPm(equipment, items, temper) +'],
  ['hero-power', 'bareIsNone', ': 0));\n}', ': 1));\n}'],
  ['hero-power', 'higherGearNoLess', 'up(WEIGHT_GEAR * levelOf(it))', 'up(WEIGHT_GEAR * Math.max(0, 100 - levelOf(it)))'],
  ['hero-power', 'deterministic', 'const WEIGHT_GEAR = 1.0;', 'let WEIGHT_GEAR = 1.0;', 'up(WEIGHT_GEAR * levelOf(it))', 'up((WEIGHT_GEAR += 0.5) * levelOf(it))'],
  ['death-cost', 'deterministic', 'const DEATH_HOURS = 7.5;', 'let DEATH_HOURS = 7.5;', 'const hours = Math.floor(DEATH_HOURS *', 'const hours = Math.floor((DEATH_HOURS += 0.5) *'],
];

async function selftest() {
  console.log('rule slots --selftest: every planted fault is caught, every refusal refuses, the identity proof and the bundle guard bite');
  const reg = readSlots();
  /* 1. A PLANTED FAMILY BREAKING EACH LINE IS CAUGHT BY THAT LINE: each mutant is the slot's formula family with a planted fault, written
     over the slot's module in a scratch copy the overlay built (so the shipped module sits beside it), imported fresh */
  const loaded = await loadFamilies(reg, { keep: true });
  try {
    const formula = new Map(loaded.families.filter((f) => f.family.kind === 'formula').map((f) => [f.slot.id, f]));
    const clean = [];
    for (const f of formula.values()) clean.push(...(await familyProblems(f)).filter((x) => x.problem).map((x) => f.slot.id + ' ' + x.id + ': ' + x.problem));
    check('the unplanted formula families hold every line (the baseline the mutants move from)', !clean.length, clean.join('; '));
    let n = 0;
    for (const [slot, line, ...pairs] of MUTANTS) {
      const base = formula.get(slot);
      let src = base.src;
      for (let i = 0; i < pairs.length; i += 2) {
        const k = src.split(pairs[i]).length - 1;
        if (k !== 1) { check(slot + ' mutant for ' + line + ': its anchor is in the family once', false, k + ' copies of ' + JSON.stringify(pairs[i])); src = null; break; }
        src = src.replace(pairs[i], () => pairs[i + 1]);
      }
      if (src === null) continue;
      writeFileSync(join(base.root, base.slot.module), src);
      let M;
      try { M = await importFrom(base.root, base.slot.module, '?mutant=' + (++n)); } catch (e) { check(slot + ' mutant for ' + line + ' loads', false, e.message); continue; }
      const probs = await familyProblems({ ...base, M, src });
      const hit = probs.find((x) => x.id === line);
      check(slot + ': a family that breaks ' + line + ' is caught by it', !!(hit && hit.problem), hit ? 'it read clean' : 'no line ' + line);
    }
    writeFileSync(join(formula.get('armor').root, 'src/core/mitigation.js'), formula.get('armor').src);
  } finally { loaded.done(); }

  /* 2. THE REGISTRY'S OWN LINES: a written line nobody checks, a stale offPath, an expired or undated family, a wrong first line */
  const planted = JSON.parse(JSON.stringify(reg.doc));
  const armor = planted.slots.find((s) => s.id === 'armor');
  armor.contract.push({ id: 'neverWritten', says: 'planted' });
  check('a contract line slot-contracts.mjs does not check is red', contractProblems({ slots: planted.slots }).some((p) => /neverWritten/.test(p)));
  check('a family that types its own file path is refused (the path is derived from the slot and the id)', (() => { try { registryOf({ ...reg.doc, slots: reg.doc.slots.map((x) => (x.id === 'armor' ? { ...x, families: x.families.map((y) => (y.id === 'hit-ratio' ? { ...y, file: 'tools/balance-program/variants/armor/x.js' } : y)) } : x)) }); return false; } catch (e) { return /derived/.test(e.message); } })());
  const hr = armor.families.find((f) => f.id === 'hit-ratio');
  const shelfOf = (mut) => { const d = JSON.parse(JSON.stringify(reg.doc)); mut(d.slots.find((s) => s.id === 'armor').families.find((f) => f.id === 'hit-ratio')); return registryOf(d); };
  check('a formula family past its date is red (read against the commit date it is given)', shelfProblems(shelfOf(() => {}), '2099-01-01').some((p) => /EXPIRED/.test(p)) && !shelfProblems(shelfOf(() => {}), hr.added).some((p) => /EXPIRED/.test(p)));
  check('a formula family with no expiry is red', shelfProblems(shelfOf((f) => { delete f.expires; }), null).some((p) => /dates/.test(p)));
  {
    /* a shelf in a temporary root: the hit-ratio family's file opening on another family's name */
    const dir = mkdtempSync(join(tmpdir(), 'rule-slots-shelf-')), f = join(dir, shelfFileOf('armor', 'hit-ratio'));
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, readFileSync(join(ROOT, shelfFileOf('armor', 'hit-ratio')), 'utf8').replace(markerLineOf('armor', 'hit-ratio'), markerLineOf('armor', 'copy')));
    const one = registryOf({ ...reg.doc, slots: reg.doc.slots.map((x) => (x.id === 'armor' ? { ...x, families: x.families.filter((y) => y.id === 'shipped' || y.id === 'hit-ratio') } : x)).filter((x) => x.id === 'armor') });
    writeFileSync(join(dir, SHELF + 'armor/armor.stray.js'), markerLineOf('armor', 'stray') + '\nexport {};\n');
    try {
      const got = shelfProblems(one, null, dir);
      check('a family whose file does not open on its own name is red', got.some((p) => /first line/.test(p)), got.join('; '));
      check('a file on the shelf that no family names is red (a variant no contract ran on)', got.some((p) => /armor\.stray\.js is on the shelf/.test(p)), got.join('; '));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const op = await offPathProblems(registryOf({ ...reg.doc, slots: reg.doc.slots.map((s) => (s.id === 'party-xp' ? { ...s, offPath: {} } : s.id === 'armor' ? { ...s, offPath: { steadyPmOf: 'planted' } } : s)) }));
  check('a shipped caller of a rule export missing from offPath is red, and a stale offPath entry too', op.some((p) => /partyVsAlone/.test(p)) && op.some((p) => /steadyPmOf.*stale/.test(p)), op.join('; '));

  /* 3. THE REFUSALS */
  const C = (o) => ({ schema: CANDIDATE_SCHEMA, id: 'planted', base: 'tree', variants: [], ...o });
  const refused = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
  check('two variants on one slot in one candidate are refused', refused(() => checkCandidate(C({ variants: [{ slot: 'armor', family: 'hit-ratio' }, { slot: 'armor', family: 'copy' }] }), reg), /two variants on slot armor/));
  check('two candidates on one slot are refused when composed', refused(() => compose([readCandidate('armor-hit-ratio', reg), readCandidate('C0-copy', reg)], reg), /both lay a family on slot armor/));
  check('three candidates on three slots compose into one patch of three overlays', candidatePatch(compose(['armor-hit-ratio', 'party-even-share', 'death-hours'].map((id) => readCandidate(id, reg)), reg), reg).overlays.length === 3);
  check('a git-ref slot\'s family is refused (its seam is not cut: a depth 4 ref)', refused(() => checkCandidate(C({ variants: [{ slot: 'level-curve', family: 'geometric' }] }), reg), /not cut/));
  check('an identity candidate naming a formula family is refused', refused(() => checkCandidate(C({ kind: 'identity', variants: [{ slot: 'armor', family: 'hit-ratio' }] }), reg), /identity candidate/));
  check('two overlays on one file are refused (a rows overlay on a slot\'s module)', refused(() => checkCandidate(C({ variants: [{ slot: 'armor', family: 'hit-ratio' }], rows: [{ file: 'src/core/mitigation.js', from: 'tools/balance-program/variants/armor/armor.copy.js' }] }), reg), /one file, one overlay/));
  check('a rows overlay from off the shelf is refused', refused(() => checkCandidate(C({ rows: [{ file: 'src/data/items.js', from: 'src/data/monsters.js' }] }), reg), /not the shelf/));
  check('a ref with anything laid over it, and two refs, are refused', refused(() => checkCandidate(C({ base: { ref: 'lane/v1-climb' }, variants: [{ slot: 'armor', family: 'hit-ratio' }] }), reg), /plays the ref alone/)
    && refused(() => compose([C({ id: 'r1', base: { ref: 'a' } }), C({ id: 'r2', base: { ref: 'b' } })], reg), /two bases/));
  check('an overlay outside the planted trees, of a missing file, from a missing source, or twice on one file is refused',
    refused(() => checkOverlays([{ file: 'tools/pack-edge.mjs', from: 'tools/pack-edge.mjs' }]), /planted trees/) && refused(() => checkOverlays([{ file: 'src/core/nope.js', from: 'tools/balance-program/variants/armor/armor.copy.js' }]), /replaces no file/)
    && refused(() => checkOverlays([{ file: 'src/core/mitigation.js', from: 'tools/balance-program/variants/armor/armor.nope.js' }]), /does not exist/)
    && refused(() => checkOverlays([{ file: 'src/core/mitigation.js', from: 'tools/balance-program/variants/armor/armor.copy.js' }, { file: 'src/core/mitigation.js', from: 'tools/balance-program/variants/armor/armor.hit-ratio.js' }]), /two overlays/));
  /* a ref candidate plays through lane/bl-baseline's materialize; with none on the tree it says so, and a planted one is called with the ref */
  const refC = checkCandidate(C({ id: 'ref', base: { ref: 'lane/v1-climb' } }), reg);
  check('a ref candidate with no materialize on the tree is refused by name', await (async () => { try { await treeOf(refC, reg, { module: join(ROOT, 'tools/balance-program/baseline/no-such-tree.mjs') }); return false; } catch (e) { return /baseline\.mjs --materialize/.test(e.message); } })());
  {
    const dir = mkdtempSync(join(tmpdir(), 'rule-slots-ref-')), stand = join(dir, 'tree.mjs');
    writeFileSync(stand, "import { mkdirSync, writeFileSync } from 'node:fs';\nimport { join } from 'node:path';\n"
      + "export function materialize({ game, into, harnessRoot }) { mkdirSync(into, { recursive: true }); writeFileSync(join(into, 'asked.json'), JSON.stringify({ game, harnessRoot })); return { game: { ref: game, sha: 'planted-' + game } }; }\n");
    try {
      const t = await treeOf(refC, reg, { module: stand });
      const asked = JSON.parse(readFileSync(join(t.root, 'asked.json'), 'utf8'));
      check('a ref candidate is played through materialize: the ref, this checkout as the harness, a fresh folder the run removes', asked.game === 'lane/v1-climb' && resolve(asked.harnessRoot) === ROOT && t.ref.sha === 'planted-lane/v1-climb' && (t.done(), !existsSync(t.root)), JSON.stringify(asked));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  /* a patch combined with a base (balance-matrix.mjs combinePatches, the --diff on a proposal base) keeps both sides' overlays */
  const both = combinePatches(candidatePatch(readCandidate('armor-hit-ratio', reg), reg), candidatePatch(readCandidate('party-even-share', reg), reg));
  check('a candidate laid on a base keeps both overlays (balance-matrix combinePatches)', (both.overlays || []).map((o) => o.slot).join() === 'armor,party-xp', JSON.stringify(both.overlays));

  /* 4. NUMBERS ON AN OVERLAY: a knob whose line the overlay took away is refused by name; a line edit on the overlay's own text applies */
  const even = readCandidate('party-even-share', reg);
  check('a knob whose line an overlay replaced is not on that game (KnobGone), and the same knob plays on C0',
    refused(() => patchEdits(ROOT, candidatePatch({ ...even, knobs: { soloXp: 1.1 } }, reg), readKnobs()), /not on this game/)
    && patchEdits(ROOT, candidatePatch({ ...readCandidate('C0', reg), knobs: { soloXp: 1.1 } }, reg), readKnobs()).edits.length === 1);
  try { patchEdits(ROOT, candidatePatch({ ...even, knobs: { soloXp: 1.1 } }, reg), readKnobs()); } catch (e) { check('  ... and it is the KnobGone class', e instanceof KnobGone, e.constructor.name); }
  const hk = { file: 'src/core/mitigation.js', from: 'const HIT_K = 0.5;', to: 'const HIT_K = 0.25;' };
  const edited = await treeOf({ ...readCandidate('armor-hit-ratio', reg), edits: [hk] }, reg);
  try { check('a line edit on the overlay\'s own text applies on the copy', readFileSync(join(edited.root, 'src/core/mitigation.js'), 'utf8').includes('const HIT_K = 0.25;') && existsSync(join(edited.root, 'src/core/mitigation.shipped.js'))); } finally { edited.done(); }
  check('the same line edit with no overlay is refused (its anchor is not on today\'s tree)', refused(() => patchEdits(ROOT, candidatePatch({ ...readCandidate('C0', reg), edits: [hk] }, reg), readKnobs()), /copies of the anchor/));

  /* 5. THE IDENTITY PROOF BITES: one cell's whole answer, byte for byte, on C0 (the tree), C0-copy and the hit-ratio family (scratch) */
  const { loadGridData } = await import('../tools/balance-program/progression-grid.mjs');
  const { loadKits } = await import('../tools/balance-program/grid-kit.mjs');
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const plan = planOf(D, K, { only: [60], blocks: ['ways'], seeds: 1, hours: 0.25 });
  const cell = plan.cells.find((c) => c.styles[0] === 'hammer') || plan.cells[0];
  const jobs = plan.jobs.filter((j) => j.key === cell.key);
  const playOn = async (id) => { const t = await treeOf(readCandidate(id, reg), reg); try { return await playJobs(jobs, t.root, 1); } finally { t.done(); } };
  const [p0, pc, ph] = [await playOn('C0'), await playOn('C0-copy'), await playOn('armor-hit-ratio')];
  const same = sameBytes(p0, pc), moved = sameBytes(p0, ph);
  check('a copy overlay plays ' + cell.key + ' byte-identical to the tree (' + same.same + ' of ' + same.of + ')', same.of > 0 && same.same === same.of && !same.errors, JSON.stringify(same));
  check('a formula family does not (the identity check would see a family that moved a byte)', moved.of > 0 && moved.same < moved.of && !moved.errors, JSON.stringify(moved));

  /* 6. NO VARIANT IN A BUNDLE: in memory, then on scratch copies the overlay really built (tools/pack-edge.mjs run inside the copy) */
  const PE = await import('../tools/pack-edge.mjs');
  const files = [{ name: 'vendor/core/a.js', origin: 'src/core/a.js', content: 'export const a = 1;\n' }];
  check('variantProblems: clean files pass', PE.variantProblems(files).length === 0);
  check('variantProblems: a file opening with the marker, a .shipped.js copy and a shelf path are each refused',
    PE.variantProblems([{ name: 'vendor/core/mitigation.js', origin: 'src/core/mitigation.js', content: readFileSync(join(ROOT, 'tools/balance-program/variants/armor/armor.hit-ratio.js'), 'utf8') }]).length === 1
    && PE.variantProblems([{ name: 'vendor/core/mitigation.shipped.js', origin: 'src/core/mitigation.shipped.js', content: 'export {};' }]).length === 1
    && PE.variantProblems([{ name: 'x.js', origin: SHELF + 'armor/x.js', content: 'export {};' }]).length === 1);
  const packIn = async (id, scratch) => {
    const t = await treeOf(readCandidate(id, reg), reg, { scratch });
    try {
      for (const f of ['tools/pack-edge.mjs', 'tests/_is-main.mjs']) { mkdirSync(dirname(join(t.root, f)), { recursive: true }); cpSync(join(ROOT, f), join(t.root, f)); }
      return await bundleVariantProblems(t.root);
    } finally { t.done(); }
  };
  const withVariant = await packIn('armor-hit-ratio', false), without = await packIn('C0', true);
  check('pack-edge refuses the bundle of a scratch copy with the hit-ratio overlay (the variant and its side copy)',
    withVariant.problems.some((p) => /^vendor\/core\/mitigation\.js: a balance variant \(balance-variant: armor\/hit-ratio\)/.test(p)) && withVariant.problems.some((p) => /^vendor\/core\/mitigation\.shipped\.js:/.test(p)), withVariant.problems.join('; '));
  check('pack-edge passes the same scratch copy with nothing laid over it', without.files > 0 && without.problems.length === 0, without.problems.join('; '));

  /* 7. THE REPORT'S ARITHMETIC (variants.mjs) */
  check('pairs: every pair moved +1 is a difference beyond noise (B higher); equal pairs are the same; one valid pair, or one seed, is thin',
    paired([1, 2, 3], [2, 3, 4]).verdict === 'B' && paired([5, 5], [5, 5]).verdict === 'same' && paired([1], [2]).verdict === 'thin' && paired([1, NaN, null], [2, 3, 4]).verdict === 'thin');
  check('pairs: a difference that wanders across zero is noise; a steady one beyond its interval is not',
    paired([10, 12, 9, 11], [10.5, 11.6, 9.4, 10.8]).verdict === 'noise' && paired([10, 12, 9, 11], [11, 13.2, 9.9, 12.1]).verdict === 'B' && paired([10, 12, 9, 11], [9, 11.1, 8, 9.9]).verdict === 'A');
  check('ahead follows the read\'s direction (less damage is ahead, more XP is ahead)', aheadOf({ verdict: 'A' }, 'lower') === 'B' && aheadOf({ verdict: 'A' }, 'higher') === 'A' && aheadOf({ verdict: 'noise' }, 'lower') === null);
  /* the exact binomial tails at 2.5% a cell: of 20, P(3 or more) is 1.29% and P(4 or more) 0.13%; of 100, P(7+) 1.4% and P(8+) under 1% */
  check('the chance count: one cell never leads alone (2 of 1), 4 of 20, 8 of 100', chanceCount(1) === 2 && chanceCount(20) === 4 && chanceCount(100) === 8 && chanceCount(0) === 1, [chanceCount(1), chanceCount(20), chanceCount(100), chanceCount(0)].join(','));
  const cellsOf = (aheadB, aheadA, n) => Array.from({ length: n }, (_, i) => ({ reads: { x: i < aheadB ? { verdict: 'B', a: 1, b: 2 } : i < aheadB + aheadA ? { verdict: 'A', a: 2, b: 1 } : { verdict: 'noise', a: 1, b: 1 } } }));
  check('a group leads only past its chance count: 2 of 20 cells is chance, 6 of 20 leads',
    groupRead(cellsOf(2, 0, 20), 'x', 'higher').lead === null && groupRead(cellsOf(6, 1, 20), 'x', 'higher').lead === 'B' && groupRead(cellsOf(1, 6, 20), 'x', 'lower').lead === 'B');
  check('a group median change is measured from the size of A: a net from -1,000 to -100 reads +90%, where a ratio would read -90%', Math.abs(groupRead([{ reads: { x: { verdict: 'B', a: -1000, b: -100 } } }], 'x', 'higher').median - 0.9) < 1e-9);
  /* the roles: each cell weighs the same, so one Level 5,000 cell cannot outvote nine others by its size */
  const roleCells = [{ roles: { x: [[1e9, 1.1e9, 0.9e9, 1e9], [0.5e9, 0.55e9, 0.45e9, 0.5e9]], y: [[5, 5, 5, 5], [5, 5, 5, 5]] } },
    ...Array.from({ length: 9 }, (_, i) => ({ roles: { x: [[10 + i, 11 + i, 12 + i, 13 + i], [1.1 * (10 + i), 1.1 * (11 + i) + 0.01, 1.1 * (12 + i), 1.1 * (13 + i)]], y: [[5, 5, 5, 5], [5, 5, 5, 5]] } }))];
  const rr = roleReads(roleCells, 4);
  check('roles: each cell weighs the same (nine cells +10% and one huge cell -50% read +1.7%, not the summed -50%); an unmoved role is the same',
    rr.x.verdict === 'B' && Math.abs(rr.x.ratio - 0.0167) < 0.002 && rr.y.verdict === 'same' && rr.x.cells === 10, JSON.stringify(rr));
  return failed ? 1 : 0;
}

if (isMain(import.meta.url)) (process.argv.includes('--selftest') ? selftest() : plain()).then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
