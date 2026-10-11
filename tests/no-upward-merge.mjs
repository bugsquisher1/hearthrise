// ============================================================================
// tests/no-upward-merge.mjs — THE BROWSER NEVER RATCHETS A SERVER NUMBER UP
//
// THE RULE (CLAUDE.md §6, Tyler 2026-09-14): every number a player can act on
// is REPLACED by each envelope, never merged upward. The class this guards is
// one line of code: `G.x = Math.max(clientCopy, serverFigure)`. Once the two
// numbers part, no envelope can ever bring the client back down, and the
// screen paints goods every gesture is then refused for. Live 2026-10-11: a
// refused +10 shop buy left 33 seeds in the bag while player_inventory held 23
// (the merge branch of accrue.js reconcileInventory, behind a STAGE='off' arm).
//
// TWO HALVES, BOTH REQUIRED:
//   A. CENSUS (static). Every `Math.max(a, b)` in the envelope-reconcile layer
//      (src/net/*.js) whose operands are BOTH non-literal is a two-sided max —
//      the shape of an upward merge. Each one must appear in ALLOW below with
//      the reason it is not one (a clamp of a server-only value, a timer, a
//      server-monotonic floor). A new one is RED until classified; an ALLOW row
//      that no longer matches anything is RED too, so the list cannot rot.
//      Clamps against a literal (`Math.max(0, x)`) are not merges and are
//      skipped by construction.
//   B. BEHAVIOUR (runtime, the real module). Client bag 33, envelope says 23 ⇒
//      the bag reads 23 — on the ARMED branch, on the MERGE branch, on a
//      complete and on an incomplete envelope; an omitted not-owned id is gone
//      under the arm; the build ships the bag armed (INVENTORY_ARM_STAGE 'on')
//      and isInventoryAbsolute no longer hangs off a per-session equip ack.
//
// --selftest: plants each defect in a COPY of src/ and demands RED —
//   M1 the merge branch's `inv[k] = Math.max(have, q)` restored  (A and B)
//   M2 the armed branch's completeness gate restored              (B)
//   M3 INVENTORY_ARM_STAGE back to 'off'                          (B)
//   M4 skills' `Math.max(have, xp)` restored                       (A)
//   M5 isInventoryAbsolute re-coupled to isEnvelopeAbsolute         (B)
//   …and the clean copy must be GREEN (the control).
// ============================================================================
import { readFileSync, readdirSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* THE CLASSIFIED TWO-SIDED MAXES. Key = file + the call text, whitespace-
   collapsed. Every reason says why the larger operand cannot be a stale client
   copy outranking a server statement. */
const ALLOW = {
  'src/net/accrue.js :: Math.max(gapHeal.lastAt ? gapHeal.lastAt + GAP_HEAL_MIN_INTERVAL_MS - now : 0, Number.isFinite(o.delayMs) ? o.delayMs : 0, jitter)':
    'TIMER — the gap-heal retry delay; no state is reconciled.',
  'src/net/accrue.js :: Math.max(Number(deferredCombatXp[k]) || 0, n)':
    'OUTBOX — the client\'s own refused XP-credit snapshot awaiting re-send; the server re-clamps every '
    + 'credit (xp_credit), and nothing displays or gates on this map.',
  'src/net/accrue.js :: Math.max(legalAfterFall, legalAfterAsk, (Number(now) || 0) + 1)':
    'TIMER — the earliest legal re-ask instant of the fall confirm.',
  'src/net/accrue.js :: Math.max(cur, rung)':
    'SERVER-MONOTONIC FLOOR — the bank rung on a TRUNCATED progress statement only (a complete one '
    + 'assigns). `cur` is homed by no residue and no client write, so it can only be an EARLIER server '
    + 'statement, and hr_unlock_buy GREATEST-merges the row, so the server value never falls. Prod '
    + 'envelopes always declare progress_truncated=false (goal-counters G7).',
  'src/net/build-watch.js :: Math.max(backoff, HIDDEN_POLL_INTERVAL_MS)':
    'TIMER — build poll back-off.',
  "src/net/build-watch.js :: Math.max(backoff, s.trigger === 'visible' ? VISIBILITY_MIN_GAP_MS : POLL_INTERVAL_MS)":
    'TIMER — build poll back-off.',
  'src/net/pending-consume.js :: Math.max(remaining, Math.min(e.seen, MAX_QTY_PER_ID))':
    'LOWERING HOLD — the anti-forgery ceiling of a local eat still in flight; a larger hold can only '
    + 'make the displayed count SMALLER, never ratchet a server figure up.',
};

/* ── A. THE CENSUS ─────────────────────────────────────────────────────────── */
function maxCalls(src) {
  const out = [];
  const re = /Math\.max\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 1, args = [], cur = '';
    let quote = null;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (quote) { cur += c; if (c === quote && src[i - 1] !== '\\') quote = null; continue; }
      if (c === '\'' || c === '"' || c === '`') { quote = c; cur += c; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      if (c === ')' || c === ']' || c === '}') depth--;
      if (depth === 0) break;
      if (c === ',' && depth === 1) { args.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    args.push(cur.trim());
    const line = src.slice(0, m.index).split('\n').length;
    out.push({ line, args, text: 'Math.max(' + args.join(', ') + ')' });
  }
  return out;
}
const isLiteral = (a) => /^[-+]?(\d[\d_]*(\.\d+)?|\.\d+)(e[-+]?\d+)?$/i.test(a) || a === 'Number.EPSILON' || a === '-Infinity';
const norm = (s) => s.replace(/\s+/g, ' ').trim();
/* A comment line is not code: skip calls that sit inside a block/line comment. */
function inComment(src, idx) {
  const before = src.slice(0, idx);
  const open = before.lastIndexOf('/*'), close = before.lastIndexOf('*/');
  if (open > close) return true;
  const lineStart = before.lastIndexOf('\n') + 1;
  return /\/\//.test(before.slice(lineStart).replace(/(['"`]).*?\1/g, ''));
}

export function census(srcRoot) {
  const dir = join(srcRoot, 'src', 'net');
  const found = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js')).sort()) {
    const src = readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n');
    for (const c of maxCalls(src)) {
      if (c.args.length < 2) continue;
      if (c.args.some((a) => a.startsWith('...'))) continue;
      if (c.args.some(isLiteral)) continue;
      const idx = src.split('\n').slice(0, c.line - 1).join('\n').length + 1;
      const lineText = src.split('\n')[c.line - 1];
      if (inComment(src, idx + lineText.indexOf('Math.max('))) continue;
      found.push({ key: 'src/net/' + f + ' :: ' + norm(c.text), file: 'src/net/' + f, line: c.line });
    }
  }
  return found;
}

function checkCensus(srcRoot, allow) {
  const problems = [];
  const found = census(srcRoot);
  const seen = new Set();
  for (const f of found) {
    seen.add(f.key);
    if (!allow[f.key]) {
      problems.push(`A: ${f.file}:${f.line} — an unclassified two-sided max \`${f.key.split(' :: ')[1]}\`. `
        + 'If it reconciles a server-owned number it is the upward-merge class (CLAUDE.md §6): ASSIGN the '
        + 'server figure instead. If it is not (a timer, a clamp of a server value, a server-monotonic '
        + 'floor), add it to ALLOW in tests/no-upward-merge.mjs with the reason.');
    }
  }
  for (const k of Object.keys(allow)) {
    if (!seen.has(k)) problems.push(`A: ALLOW row matches nothing any more — delete it: ${k}`);
  }
  return problems;
}

/* ── B. THE BEHAVIOUR ──────────────────────────────────────────────────────── */
async function checkBehaviour(srcRoot, tag) {
  const problems = [];
  const fail = (m) => problems.push('B: ' + m);
  const accSrc = readFileSync(join(srcRoot, 'src', 'net', 'accrue.js'), 'utf8');
  const v = (accSrc.match(/item-authority\.js\?v=(\d+)/) || [])[1];
  const q = v ? `?v=${v}` : '';
  let A, IA;
  try {
    IA = await import(pathToFileURL(join(srcRoot, 'src', 'data', 'item-authority.js')).href + q);
    A = await import(pathToFileURL(join(srcRoot, 'src', 'net', 'accrue.js')).href + q);
  } catch (e) {
    fail(`could not import the modules (${tag}), so nothing below ran: ${e && e.message}`);
    return problems;
  }
  if (IA.INVENTORY_ARM_STAGE !== 'on') {
    fail(`INVENTORY_ARM_STAGE is '${IA.INVENTORY_ARM_STAGE}' — the bag ships on MERGE for every player, `
      + 'so no envelope may lower a client over-count of a key it omits.');
  }
  const body = (accSrc.match(/export function isInventoryAbsolute\(\) \{[\s\S]*?\n\}/) || [''])[0];
  if (!body) fail('could not find isInventoryAbsolute() in accrue.js');
  else if (/isEnvelopeAbsolute\(\)/.test(body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) {
    fail('isInventoryAbsolute() reads isEnvelopeAbsolute() again — the bag is absolute only in a session '
      + 'whose player happened to equip something (the per-session-luck defect b547 named).');
  }
  const seed = 'turnip_seed';
  const cases = [
    { name: 'merge, incomplete', armed: false, complete: false },
    { name: 'merge, complete', armed: false, complete: true },
    { name: 'ARMED, incomplete', armed: true, complete: false },
    { name: 'ARMED, complete', armed: true, complete: true },
  ];
  for (const c of cases) {
    const G = { inventory: { [seed]: 33 } };
    const res = { inventory: { [seed]: 23 }, inventory_complete: c.complete };
    try { A.reconcileInventory(G, res, c.armed, c.complete); } catch (e) { fail(`${c.name}: threw ${e && e.message}`); continue; }
    if (G.inventory[seed] !== 23) {
      fail(`${c.name}: client bag 33, envelope says 23, bag reads ${G.inventory[seed]} — an upward merge `
        + 'survived the envelope (the 2026-10-11 phantom seeds).');
    }
  }
  /* Armed: an id the projection OMITS is not held — owned or not. */
  {
    const G = { inventory: { [seed]: 4, burnt_food: 7, hearth_token: 2 } };
    try { A.reconcileInventory(G, { inventory: { [seed]: 4 }, inventory_complete: false }, true, false); }
    catch (e) { fail('armed omission: threw ' + (e && e.message)); }
    const left = Object.keys(G.inventory).filter((k) => k !== seed);
    if (left.length) {
      fail('armed: the envelope omits ' + left.join(', ') + ' and the bag still shows them — the '
        + 'not-owned carve-out (omitted ⇒ keep) is back on the armed branch.');
    }
  }
  /* The prediction layer: a pending local gain shows, but the gate reads the server. */
  {
    const G = { inventory: {} };
    A.reconcileInventory(G, { inventory: { copper_ore: 2 }, inventory_complete: true }, true, true);
    G.inventory.copper_ore = (G.inventory.copper_ore || 0) + 5;   // an attended gather predicted 5
    const pred = A.bagPrediction(G);
    if (G.inventory.copper_ore !== 7 || pred.copper_ore !== 5) fail(`prediction layer: display ${G.inventory.copper_ore}, predicted ${pred.copper_ore} — expected 7 / 5`);
    if (A.gateItemCount(G, 'copper_ore') !== 2) fail(`the spend gate read ${A.gateItemCount(G, 'copper_ore')} — a prediction reached a gate`);
    A.reconcileInventory(G, { inventory: { copper_ore: 3 }, inventory_complete: true }, true, true);
    if (G.inventory.copper_ore !== 3 || Object.keys(A.bagPrediction(G)).length) fail('the next envelope did not clear the prediction');
  }
  return problems;
}

/* ── THE MUTANTS ───────────────────────────────────────────────────────────── */
function stage(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'no-upward-merge-'));
  cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
  if (mutate) mutate(dir);
  return dir;
}
function edit(dir, rel, from, to) {
  const p = join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`mutant anchor missing in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.replace(from, to));
}
const MUTANTS = [
  ['M1 merge branch max restored', (d) => edit(d, 'src/net/accrue.js',
    'if (q > 0) inv[k] = Math.floor(q); else delete inv[k];',
    'const have = Number(inv[k]) || 0; if (Number.isFinite(q) && q > 0) inv[k] = Math.max(have, q);')],
  ['M2 armed completeness gate restored', (d) => edit(d, 'src/net/accrue.js',
    'if (invAbsolute && invNamedRaw && invNamed',
    'if (invAbsolute && baselineComplete && invNamedRaw && invNamed')],
  ['M3 stage off', (d) => edit(d, 'src/data/item-authority.js',
    "export const INVENTORY_ARM_STAGE = 'on';", "export const INVENTORY_ARM_STAGE = 'off';")],
  ['M4 skills max restored', (d) => edit(d, 'src/net/accrue.js',
    '      const next = xp;\n', '      const next = Math.max(Number(skills[k]) || 0, xp);\n')],
  ['M5 bag re-coupled to the equip ack', (d) => edit(d, 'src/net/accrue.js',
    '  return !bagMergeForced();\n}\n\n/** The per-device', '  return isEnvelopeAbsolute();\n}\n\n/** The per-device')],
];

async function run(srcRoot, tag) {
  return checkCensus(srcRoot, ALLOW).concat(await checkBehaviour(srcRoot, tag));
}

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const f of census(ROOT)) console.log(`${f.file}:${f.line}  ${f.key.split(' :: ')[1]}`);
  process.exit(0);
}
if (args.includes('--selftest')) {
  let bad = 0;
  const control = stage(null);
  try {
    const p = await run(control, 'control');
    if (p.length) { bad++; console.log('✗ CONTROL (clean copy) is RED — the selftest proves nothing:\n  ' + p.join('\n  ')); }
    else console.log('✓ control: the clean copy is green');
  } finally { rmSync(control, { recursive: true, force: true }); }
  for (const [name, m] of MUTANTS) {
    const d = stage((dir) => m(dir));
    try {
      const p = await run(d, name);
      if (!p.length) { bad++; console.log(`✗ ${name}: survived — the guard did not bite`); }
      else console.log(`✓ ${name}: caught (${p.length}) — ${p[0].slice(0, 110)}`);
    } finally { rmSync(d, { recursive: true, force: true }); }
  }
  console.log(bad ? `no-upward-merge --selftest: RED (${bad})` : 'no-upward-merge --selftest: green — every mutant caught, control clean');
  process.exit(bad ? 1 : 0);
}
const problems = await run(ROOT, 'repo');
if (problems.length) {
  console.log('no-upward-merge: RED\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`no-upward-merge: green — ${census(ROOT).length} two-sided max call(s) in src/net, all classified; the bag is replaced by every envelope.`);
