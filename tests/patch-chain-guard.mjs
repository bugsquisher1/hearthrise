#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/patch-chain-guard.mjs — A FUNCTION BODY THAT ONLY EXISTS AS A STACK OF
//                                REGEXES IS NOT AUTHORED (cleanup slice 1b)
//
//   node tests/patch-chain-guard.mjs             gate against the baseline
//   node tests/patch-chain-guard.mjs --report    print the chains, gate too
//   node tests/patch-chain-guard.mjs --list      the full census, machine-ish
//   node tests/patch-chain-guard.mjs --write     re-record the baseline
//   node tests/patch-chain-guard.mjs --selftest  mutation proof
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// This repository patches live Postgres function bodies PROGRAMMATICALLY: read
// the installed text with pg_get_functiondef, `replace()` an exact anchor string
// inside it, and `execute` the result. It is a good technique and it is used
// carefully here — every one of them checks its anchor matched exactly once and
// raises rather than patching blind. That is not the problem.
//
// The problem is what a CHAIN of them does to the source of truth. After the
// last full `create or replace`, hr_apply has taken 10 further anchored edits
// from 3 different migrations, and hr_state_of 10 from 9. The body that actually
// runs on production — the one that moves gold — exists in NO FILE. It exists
// only as "the 2026-08-25 text, plus these ten edits, applied in the order
// tests/schema-apply-order.json says". To read it you must replay it. To review
// it you must replay it. And every new patch has to anchor on a string that the
// PREVIOUS patch left behind, which is why the comments in
// 2026-09-06-recovering-until.sql have to explain that the array terminator is
// "whatever the most recent programmatic patcher left there" and that anchoring
// on it would eventually match nothing and no-op IN SILENCE.
//
// The server audit's standing rule, which this makes executable:
//
//     DO NOT ADD A PATCH TO A CHAIN THAT IS ALREADY TWO PATCHES DEEP.
//     RESTATE THE BODY INSTEAD.
//
// Today's chains are GRANDFATHERED — the point of slice 1b is a floor, not a
// stop-work order — and they are listed by name with their depth so slice 7 has
// its target list without anyone re-deriving it.
//
// ── THE ASSERTIONS ──────────────────────────────────────────────────────────
//   PATCH-1  a NEW migration adds an anchored patch to a function whose chain is
//            already >= 2 deep, and the file carries no RESTATEMENT-DEBT-ACK.
//   PATCH-2  a GRANDFATHERED chain got DEEPER by MORE than the new migrations
//            account for — i.e. somebody added an anchored edit to a migration
//            that already exists. (An applied migration is history; editing it
//            changes what a rebuild produces without changing production.)
//            Budgeted, not all-or-nothing: the old form suppressed PATCH-2 for
//            the whole chain as soon as ONE new file touched it, so five edits
//            smuggled into applied files were invisible whenever a single new
//            migration rode along. The depth a new file may add is exactly the
//            patch count it declares; anything above that came from history.
//   PATCH-3  a NEW function has grown a chain >= 2 deep and is not in the
//            baseline. Same rule, applied to bodies the audit never saw.
//   PATCH-4  a RESTATEMENT-DEBT-ACK header on a file that patches nothing, or
//            one whose reason is a word. An unused or empty waiver is how the
//            next one gets rubber-stamped.
//   PATCH-5  a migration that CONTRIBUTED a grandfathered patch has vanished
//            from the apply order. Every depth here is a claim about a history;
//            if the evidence is gone the history is not the one the baseline was
//            cut from, and the chain would otherwise read as having got SHALLOWER
//            — i.e. as progress. It is also what stops this guard going green on
//            an empty supabase/migrations.
//
//   A chain that got SHALLOWER (slice 7 restating a body) is a NOTE telling you
//   to re-run --write — never a failure.
//
// ── THE WAIVER ──────────────────────────────────────────────────────────────
// A file may carry, in its first 120 lines, a comment line of the form
//     -- RESTATEMENT-DEBT-ACK: <reason>
// with a real reason (>= 20 characters). It waives PATCH-1/PATCH-3 for that file
// only. It exists because there IS a legitimate case — a one-line security fix
// that must ship tonight against a body nobody has time to restate safely — and
// because a rule with no escape hatch gets deleted rather than followed. The
// reason is written into the file, so it is in the diff, in review and in
// `git blame` forever.
//
// ── HOW A PATCH IS RECOGNISED (the method, printed by --report) ─────────────
// Inside each `do $tag$ … $tag$` block, with -- and /* */ comments stripped:
//   1. a variable is bound to a function's installed text by
//      `VAR := pg_get_functiondef(<sig>)`, `select pg_get_functiondef(<sig>)
//      into VAR`, or `VAR := replace(pg_get_functiondef(<sig>), …)`;
//   2. <sig> resolves to a name when it is a literal 'public.f(args)', a
//      `to_regprocedure('public.f(args)')`, or a block-local constant holding
//      one. A loop variable does not resolve — see BULK below;
//   3. the value flows through one or more `replace()` / `regexp_replace()`
//      calls (transitively, so `v_new := replace(v_def, …)` is followed);
//   4. and the result is `execute`d.
// Each `replace()`/`regexp_replace()` on that value is ONE patch. The `execute`
// is required: this repo also reads function bodies to ASSERT on them (§4
// self-checks), and a self-check is not a patch.
//
// BULK: one block in the tree today patches twelve bodies from a `values` table
// (2026-09-03-intent-mismatch-class.sql). Its signature expression is a loop
// variable and cannot be resolved by reading; the targets ARE the 'public.f(…)'
// literals in the block, so they are attributed that way and the block is named
// in --report as a bulk patch, so the attribution is never silent folklore.
//
// ORDER: taken from tests/schema-apply-order.json (`order`), the same list
// tests/schema-drift.mjs replays — NOT filename order, which does not replay
// here and would compute "since the last restatement" against a history that
// never happened. Any .sql not in that list is appended in filename order and
// flagged, because an unordered migration is a separate, real problem.
//
// Credential-free, database-free, no replay, milliseconds.
// Exit: 0 green (or green-with-note) · 1 a chain grew · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const APPLY_ORDER = join(ROOT, 'tests', 'schema-apply-order.json');
const BASELINE = join(ROOT, 'tests', 'patch-chain-guard.baseline.json');

/** The audit's standing rule. A chain at or past this depth must be restated. */
export const MAX_CHAIN_DEPTH = 2;
/** The waiver, and the floor on how much of a reason counts as one. */
const ACK_RE = /^\s*--\s*RESTATEMENT-DEBT-ACK:\s*(.+?)\s*$/m;
const ACK_HEAD_LINES = 120;
const ACK_MIN_REASON = 20;

// ── reading SQL ──────────────────────────────────────────────────────────
/** Strip -- line comments and /* *​/ blocks. Dollar-quoted bodies keep their text. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Every `do $tag$ … $tag$` block, with its offset. */
export function doBlocks(sql) {
  const out = [];
  const re = /\bdo\s+\$([A-Za-z_]*)\$/gi;
  let m;
  while ((m = re.exec(sql))) {
    const tag = `$${m[1]}$`;
    const close = sql.indexOf(tag, m.index + m[0].length);
    if (close < 0) continue;
    out.push({ at: m.index, text: sql.slice(m.index, close + tag.length) });
    re.lastIndex = close + tag.length;
  }
  return out;
}

const fnNameOf = (sig) => {
  const m = /(?:public\.)?([a-z0-9_]+)\s*\(/i.exec(String(sig || ''));
  return m ? m[1].toLowerCase() : null;
};

/**
 * NORMALISATION IS NOT A PATCH. Half the blocks in this tree begin by stripping
 * CR from the installed text (a body applied from a CRLF working copy is STORED
 * with CRLF, and an LF-joined anchor would then match nothing — the trap
 * 2026-08-23-modal-goal-claims.sql §5 documents) or collapse whitespace to hash
 * the body. Neither changes what the function DOES, neither creates an anchor
 * the next patch has to depend on, and counting them would inflate every chain
 * by one and make the depth number mean less than it should.
 * @param {string} searchArg the second argument of replace()/regexp_replace()
 */
export function isNormaliser(searchArg) {
  const a = String(searchArg || '').trim();
  return /chr\s*\(\s*1[03]\s*\)/i.test(a)                       // chr(13) / chr(10)
    || /\[\[:space:\]\]/.test(a)                                // '[[:space:]]+'
    || /^E?'(\\r|\\n|\\s\+|\\r\\n)'$/i.test(a);                 // E'\r', '\s+'
}

/**
 * Every restatement and anchored patch in ONE file, in source order.
 * Pure: text in, events out — so --selftest can feed it synthetic SQL.
 * @returns {{at:number, kind:'restate'|'patch', fn:string, bulk?:boolean}[]}
 */
export function eventsIn(sqlText) {
  const s = stripSqlComments(sqlText);
  const events = [];

  // ── full restatements ────────────────────────────────────────────────
  for (const m of s.matchAll(/\bcreate\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi)) {
    events.push({ at: m.index, kind: 'restate', fn: m[1].toLowerCase() });
  }

  // ── anchored programmatic patches ────────────────────────────────────
  for (const b of doBlocks(s)) {
    const t = b.text;

    // block-local constants that hold a signature: c_sig constant text := 'public.f(…)'
    const consts = new Map();
    for (const m of t.matchAll(/\b([a-z_][\w]*)\s+(?:constant\s+)?text\s*:=\s*'(public\.[a-z0-9_]+\([^']*\))'/gi)) {
      consts.set(m[1].toLowerCase(), m[2]);
    }
    for (const m of t.matchAll(/\b([a-z_][\w]*)\s*:=\s*'(public\.[a-z0-9_]+\([^']*\))'\s*;/gi)) {
      if (!consts.has(m[1].toLowerCase())) consts.set(m[1].toLowerCase(), m[2]);
    }

    /** Resolve the argument of pg_get_functiondef( … ) to a function name, or null. */
    const resolveSig = (arg) => {
      const a = String(arg || '').trim();
      let m = /^to_regprocedure\s*\(\s*'([^']+)'/i.exec(a) || /^'([^']+)'/.exec(a);
      if (m) return fnNameOf(m[1]);
      m = /^([a-z_][\w]*)\s*(?:::regprocedure)?/i.exec(a);
      if (m && consts.has(m[1].toLowerCase())) return fnNameOf(consts.get(m[1].toLowerCase()));
      return null;                                   // a loop variable — BULK
    };

    // 1. bind variables to installed function text
    const defs = new Map();          // var -> fn name (or '' when unresolved)
    const bind = (v, fn) => { if (!defs.has(v.toLowerCase())) defs.set(v.toLowerCase(), fn); };
    const GFD = 'pg_get_functiondef';
    for (const m of t.matchAll(new RegExp(`\\b([a-z_][\\w]*)\\s*:=\\s*${GFD}\\s*\\(([^;]*?)\\)\\s*;`, 'gi'))) {
      bind(m[1], resolveSig(m[2]));
    }
    for (const m of t.matchAll(new RegExp(`select\\s+${GFD}\\s*\\(([\\s\\S]{0,200}?)\\)\\s*into\\s+([a-z_][\\w]*)`, 'gi'))) {
      bind(m[2], resolveSig(m[1]));
    }
    // inline: VAR := replace(pg_get_functiondef(<sig>), …)
    for (const m of t.matchAll(new RegExp(`\\b([a-z_][\\w]*)\\s*:=\\s*(?:regexp_)?replace\\s*\\(\\s*${GFD}\\s*\\(([\\s\\S]{0,200}?)\\)\\s*,`, 'gi'))) {
      bind(m[1], resolveSig(m[2]));
    }

    // 2. follow the value through replace() chains
    const mutations = [];            // { dst, src, normaliser }
    for (const m of t.matchAll(/\b([a-z_][\w]*)\s*:=\s*(?:regexp_)?replace\s*\(\s*([a-z_][\w]*)\s*,\s*([^,]{0,80})/gi)) {
      mutations.push({ dst: m[1].toLowerCase(), src: m[2].toLowerCase(), normaliser: isNormaliser(m[3]) });
    }
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (const mu of mutations) {
        if (defs.has(mu.src) && !defs.has(mu.dst)) { defs.set(mu.dst, defs.get(mu.src)); moved = true; }
      }
      if (!moved) break;
    }

    // 3. which variables are executed?
    const executed = new Set([...t.matchAll(/\bexecute\s+([a-z_][\w]*)\s*;/gi)].map((m) => m[1].toLowerCase()));
    if (!executed.size) continue;    // a §4 self-check reads a body; it does not patch it

    // WHICH EDITS ACTUALLY LAND. An edit counts only if its result reaches an
    // `execute` — directly or through further replace()s. The closure runs
    // BACKWARDS from the executed variables, which is what separates a real
    // patch from the scratch normalisation (`v_norm := regexp_replace(v_def,
    // '[[:space:]]+',' ')`) that half these blocks also do to hash the body.
    const reaches = new Set(executed);
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (const mu of mutations) {
        if (reaches.has(mu.dst) && !reaches.has(mu.src)) { reaches.add(mu.src); moved = true; }
      }
      if (!moved) break;
    }

    // an inline `VAR := replace(pg_get_functiondef(…), …)` IS the first edit of
    // its own chain — there is no separate binding statement to attribute it to.
    // Unless it is the CR strip, which is how most of them open.
    const inlineFirst = new Set();
    for (const m of t.matchAll(new RegExp(
      `\\b([a-z_][\\w]*)\\s*:=\\s*(?:regexp_)?replace\\s*\\(\\s*${GFD}\\s*\\([\\s\\S]{0,200}?\\)\\s*,\\s*([^,]{0,80})`, 'gi'))) {
      if (!isNormaliser(m[2])) inlineFirst.add(m[1].toLowerCase());
    }

    // the literals in this block, used only when a signature does not resolve
    const literals = [...new Set([...t.matchAll(/'(public\.[a-z0-9_]+\([^']*\))'/gi)]
      .map((m) => fnNameOf(m[1])).filter(Boolean))];

    const push = (fn, bulk) => {
      if (fn) events.push({ at: b.at, kind: 'patch', fn, bulk: false });
      else for (const l of literals) events.push({ at: b.at, kind: 'patch', fn: l, bulk: true });
    };

    for (const v of inlineFirst) if (reaches.has(v) && defs.has(v)) push(defs.get(v));
    for (const mu of mutations) {
      if (mu.normaliser) continue;
      if (!reaches.has(mu.dst) || !defs.has(mu.src)) continue;
      push(defs.get(mu.src));
    }
  }

  events.sort((a, b) => a.at - b.at);
  return events;
}

/** The acknowledgement waiver, if the file's header carries a real one. */
export function ackOf(sqlText) {
  const head = sqlText.split(/\r?\n/).slice(0, ACK_HEAD_LINES).join('\n');
  const m = ACK_RE.exec(head);
  if (!m) return null;
  const reason = m[1].trim();
  return { reason, ok: reason.length >= ACK_MIN_REASON };
}

// ── the census ───────────────────────────────────────────────────────────
export function applyOrder(root) {
  const files = existsSync(join(root, 'supabase', 'migrations'))
    ? readdirSync(join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort()
    : [];
  let order = [];
  try { order = JSON.parse(readFileSync(join(root, 'tests', 'schema-apply-order.json'), 'utf8')).order || []; }
  catch { order = []; }
  const known = new Set(order);
  const unordered = files.filter((f) => !known.has(f));
  return { order: [...order.filter((f) => files.includes(f)), ...unordered], unordered };
}

/**
 * Replay the whole repo chain and report, per function, the depth since its last
 * full restatement plus which file contributed each patch.
 */
export function census(root) {
  const migDir = join(root, 'supabase', 'migrations');
  const { order, unordered } = applyOrder(root);
  const chains = new Map();
  const get = (fn) => {
    if (!chains.has(fn)) chains.set(fn, { fn, depth: 0, files: [], lastRestatement: null, restatements: 0, totalPatches: 0, bulk: 0 });
    return chains.get(fn);
  };
  /** per-file: which functions it patched, and the depth each chain had BEFORE it */
  const perFile = new Map();

  for (const f of order) {
    let text;
    try { text = readFileSync(join(migDir, f), 'utf8'); } catch { continue; }
    const events = eventsIn(text);
    const rec = { file: f, patched: new Map(), restated: [], ack: ackOf(text) };
    for (const e of events) {
      const c = get(e.fn);
      if (e.kind === 'restate') {
        c.depth = 0; c.files = []; c.lastRestatement = f; c.restatements++;
        rec.restated.push(e.fn);
      } else {
        if (!rec.patched.has(e.fn)) rec.patched.set(e.fn, { count: 0, depthBefore: c.depth });
        rec.patched.get(e.fn).count++;
        c.depth++; c.totalPatches++;
        if (e.bulk) c.bulk++;
        if (c.files[c.files.length - 1] !== f) c.files.push(f);
      }
    }
    perFile.set(f, rec);
  }

  const rows = [...chains.values()].filter((c) => c.totalPatches > 0)
    .sort((a, b) => b.depth - a.depth || b.totalPatches - a.totalPatches || a.fn.localeCompare(b.fn));
  return { rows, perFile, order, unordered };
}

export function compare(now, base) {
  const problems = [];
  const notes = [];
  const fail = (check, message) => problems.push({ check, message });

  const known = new Set((base && base.knownMigrations) || []);
  const baseChains = new Map(Object.entries((base && base.chains) || {}));

  // PATCH-1 / PATCH-4 — the new migrations.
  for (const [file, rec] of now.perFile) {
    const isNew = known.size > 0 && !known.has(file);
    if (rec.ack && !rec.ack.ok) {
      fail('PATCH-4', `${file}: RESTATEMENT-DEBT-ACK reason is ${rec.ack.reason.length} characters `
        + `("${rec.ack.reason}"). A waiver with no argument in it is a rubber stamp; write at least `
        + `${ACK_MIN_REASON} characters saying why this body cannot be restated.`);
    } else if (rec.ack && rec.ack.ok && rec.patched.size === 0) {
      fail('PATCH-4', `${file}: carries RESTATEMENT-DEBT-ACK but adds no anchored patch. A stale `
        + 'waiver is how the next one gets waved through — delete the line.');
    }
    if (!isNew) continue;
    for (const [fn, p] of rec.patched) {
      if (p.depthBefore < MAX_CHAIN_DEPTH) continue;
      if (rec.ack && rec.ack.ok) {
        notes.push(`${file}: patches ${fn} at depth ${p.depthBefore} under RESTATEMENT-DEBT-ACK — `
          + `"${rec.ack.reason}"`);
        continue;
      }
      fail('PATCH-1', `${file} adds ${p.count} anchored patch(es) to public.${fn}, whose chain is `
        + `already ${p.depthBefore} deep since the last full restatement `
        + `(${(baseChains.get(fn) || {}).lastRestatement || 'none in supabase/migrations'}). `
        + `RESTATE the body: author the whole function in this migration instead of anchoring on `
        + `text the previous ${p.depthBefore} patches left behind. If it genuinely cannot wait, add `
        + '`-- RESTATEMENT-DEBT-ACK: <why>` to the file header.');
    }
  }

  // PATCH-2 — a grandfathered chain deepened by more than the new files declare.
  // The budget is derived from the census itself: every migration the baseline
  // has not seen may raise the chain by the patch count IT contributes, and not
  // one more. Depth beyond that budget can only have come from editing a file
  // that was already applied.
  for (const [fn, b] of baseChains) {
    const r = now.rows.find((x) => x.fn === fn);
    const depth = r ? r.depth : 0;
    if (depth > b.depth) {
      const newFiles = (r ? r.files : []).filter((f) => !known.has(f));
      let budget = 0;
      for (const f of newFiles) {
        const rec = now.perFile.get(f);
        const p = rec && rec.patched.get(fn);
        budget += p ? p.count : 0;
      }
      if (depth > b.depth + budget) {
        fail('PATCH-2', `public.${fn}: chain deepened ${b.depth} → ${depth}, but the `
          + `${newFiles.length} new migration(s) touching it only account for ${budget}. `
          + 'An anchored edit was added to a migration that has already been applied — production '
          + 'did not change, but a rebuild from this repo now produces a different body.');
      }
    } else if (depth < b.depth) {
      notes.push(`public.${fn}: chain ${b.depth} → ${depth}`
        + (r && r.lastRestatement !== b.lastRestatement ? ` (restated by ${r.lastRestatement})` : '')
        + ' — run --write');
    }
  }

  // PATCH-3 — a body the baseline never saw that is already too deep.
  for (const r of now.rows) {
    if (baseChains.has(r.fn) || r.depth < MAX_CHAIN_DEPTH) continue;
    const acked = r.files.every((f) => { const rec = now.perFile.get(f); return rec && rec.ack && rec.ack.ok; });
    if (acked) { notes.push(`public.${r.fn}: new chain at depth ${r.depth}, every file acked`); continue; }
    fail('PATCH-3', `public.${r.fn} is not in the baseline and its chain is already ${r.depth} deep `
      + `(${r.files.join(', ')}). The rule is the same for a body the audit never saw: restate it.`);
  }

  // PATCH-5 — the census's own integrity. Every depth above is "since the last
  // restatement", which is a statement about a HISTORY. If a file that
  // contributed one of those patches is gone, the history is not the one the
  // baseline was cut from — and a chain whose evidence vanished would otherwise
  // read as a ratchet-DOWN, i.e. as progress. It is also the only thing standing
  // between this guard and going green on an empty supabase/migrations.
  const present = new Set(now.order);
  for (const [fn, b] of baseChains) {
    for (const f of (b.files || [])) {
      if (present.has(f)) continue;
      fail('PATCH-5', `${f} contributed a patch to public.${fn} and is no longer in the apply order `
        + '(deleted, renamed, or dropped from tests/schema-apply-order.json). An applied migration '
        + 'is history: removing it does not change production, it changes what a rebuild produces.');
    }
  }

  if (now.unordered.length) {
    notes.push(`${now.unordered.length} migration(s) are not in tests/schema-apply-order.json and were `
      + `appended in filename order: ${now.unordered.join(', ')}`);
  }
  return { problems, notes };
}

// ── output ───────────────────────────────────────────────────────────────
function printReport(now) {
  console.log('  PATCH CHAINS — anchored programmatic edits since each body\'s last full restatement');
  console.log('  order: tests/schema-apply-order.json (the list schema-drift replays), not filenames\n');
  console.log('  function                              depth  files  total  restated  last full restatement');
  for (const r of now.rows) {
    console.log('    public.' + r.fn.padEnd(32)
      + String(r.depth).padStart(4) + String(r.files.length).padStart(7)
      + String(r.totalPatches).padStart(7) + String(r.restatements).padStart(10)
      + '  ' + (r.lastRestatement || '— (schema.sql or never)'));
  }
  const over = now.rows.filter((r) => r.depth >= MAX_CHAIN_DEPTH);
  console.log(`\n  ${over.length} chain(s) at or past the rule's depth of ${MAX_CHAIN_DEPTH} — `
    + 'slice 7\'s target list, in the order the audit ranked them:');
  for (const r of over) {
    console.log(`    public.${r.fn} (${r.depth}) ← ${r.files.join(', ')}`);
  }
  const bulk = now.rows.filter((r) => r.bulk);
  if (bulk.length) {
    console.log(`\n  attributed from a BULK block (signature is a loop variable; targets taken from the`);
    console.log('  block\'s public.f(…) literals): ' + bulk.map((r) => `${r.fn}×${r.bulk}`).join(', '));
  }
}

export function run(argv = []) {
  const now = census(ROOT);
  if (argv.includes('--list')) {
    for (const r of now.rows) {
      console.log(`${r.fn}\tdepth=${r.depth}\ttotal=${r.totalPatches}\trestatements=${r.restatements}`
        + `\tlast=${r.lastRestatement || '-'}\tfiles=${r.files.join('|')}`);
    }
    return 0;
  }
  if (argv.includes('--write')) {
    const chains = {};
    for (const r of now.rows) {
      chains[r.fn] = {
        depth: r.depth, files: r.files, totalPatches: r.totalPatches,
        restatements: r.restatements, lastRestatement: r.lastRestatement,
      };
    }
    writeFileSync(BASELINE, JSON.stringify({
      _why: 'THE GRANDFATHERED PATCH CHAINS. Every function body that exists today only as a full '
        + 'restatement plus a stack of anchored regex edits, with the depth of that stack. New '
        + 'migrations are held to the rule (no patch onto a chain already >= '
        + `${MAX_CHAIN_DEPTH} deep without an ack); these are the debt slice 7 pays. Regenerated by `
        + '`node tests/patch-chain-guard.mjs --write` — never to make a red build green (CLAUDE.md §2).',
      _method: 'per do-block: a variable bound to pg_get_functiondef(<sig>), flowed through '
        + 'replace()/regexp_replace(), and executed. Each replace() is one patch. A block that reads '
        + 'a body without executing it is a §4 self-check, not a patch. Order from '
        + 'tests/schema-apply-order.json.',
      measured: new Date().toISOString().slice(0, 10),
      maxChainDepth: MAX_CHAIN_DEPTH,
      knownMigrations: now.order,
      chains,
    }, null, 2) + '\n');
    printReport(now);
    console.log('\n✓ baseline written → tests/patch-chain-guard.baseline.json');
    return 0;
  }
  if (!existsSync(BASELINE)) { console.error('PATCH-CHAIN: no baseline. Run --write once.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { problems, notes } = compare(now, base);
  if (argv.includes('--report')) printReport(now);

  if (problems.length) {
    console.error(`  ✗ patch-chain guard: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`      ${p.check}  ${p.message}`);
    console.error('\n  A body that exists only as "the old text plus N regexes" cannot be read, reviewed');
    console.error('  or reasoned about without replaying it, and each new anchor depends on what the');
    console.error('  last patch happened to leave behind — the failure mode being a patch that matches');
    console.error('  nothing and no-ops in silence.');
    return 1;
  }
  const over = now.rows.filter((r) => r.depth >= MAX_CHAIN_DEPTH);
  console.log(`✓ patch-chain guard: ${now.rows.length} patched function(s), ${over.length} chain(s) at `
    + `depth >= ${MAX_CHAIN_DEPTH} (grandfathered), no new migration deepens one`);
  if (over.length) {
    console.log('      slice 7 target list: '
      + over.map((r) => `${r.fn} (${r.depth})`).join(', '));
  }
  for (const n of notes) console.log(`      ${n}`);
  return 0;
}

/* ── MUTATION PROOF ──────────────────────────────────────────────────────
   Three halves. The READER is proven on synthetic SQL with a known answer,
   including the four shapes it must REFUSE to call a patch — because a reader
   that sees a patch everywhere, or nowhere, is green forever either way. The
   COMPARATOR gets one planted defect per assertion, each required to be caught
   BY ITS NAMED CHECK. Then the movements that must be notes, and the controls. */
function selftest() {
  let bad = 0;
  const say = (ok, label, extra = '') => {
    if (ok) console.log(`  ok       ${label}${extra}`);
    else { bad++; console.log(`  WRONG    ${label}${extra}`); }
  };

  console.log('patch-chain-guard --selftest\n  ── the READER (synthetic SQL, known answers) ──');
  const P = (fn, n = 1) => ({ fn, patches: n });
  const cases = [
    ['a full restatement', `create or replace function public.hr_x(a int) returns int as $$ begin end $$;`,
      { restate: ['hr_x'], patch: [] }],
    ['one anchored patch, literal signature',
      `do $m$ declare v_def text; begin
         v_def := pg_get_functiondef('public.hr_x(int)'::regprocedure);
         v_def := replace(v_def, 'a', 'b');
         execute v_def;
       end $m$;`, { restate: [], patch: [P('hr_x')] }],
    ['two anchored patches in one block are TWO patches',
      `do $m$ declare v_def text; begin
         v_def := pg_get_functiondef('public.hr_x(int)'::regprocedure);
         v_def := replace(v_def, 'a', 'b');
         v_def := replace(v_def, 'c', 'd');
         execute v_def;
       end $m$;`, { restate: [], patch: [P('hr_x', 2)] }],
    ['the value flows through a SECOND variable',
      `do $m$ declare v_def text; v_new text; begin
         v_def := pg_get_functiondef('public.hr_y(int)'::regprocedure);
         v_new := replace(v_def, 'a', 'b');
         execute v_new;
       end $m$;`, { restate: [], patch: [P('hr_y')] }],
    ['inline CR-strip binds but does NOT count: only the real anchor does',
      `do $m$ declare v_def text; begin
         v_def := replace(pg_get_functiondef(to_regprocedure('public.hr_z(int)')), chr(13), '');
         v_def := replace(v_def, 'a', 'b');
         execute v_def;
       end $m$;`, { restate: [], patch: [P('hr_z', 1)] }],
    ['inline replace with a REAL anchor is itself the first patch',
      `do $m$ declare v_def text; begin
         v_def := replace(pg_get_functiondef(to_regprocedure('public.hr_z(int)')), 'old', 'new');
         v_def := replace(v_def, 'a', 'b');
         execute v_def;
       end $m$;`, { restate: [], patch: [P('hr_z', 2)] }],
    ['a THREE-hop chain through two scratch variables',
      `do $m$ declare v_def text; v_a text; v_b text; begin
         v_def := pg_get_functiondef('public.hr_h(int)'::regprocedure);
         v_a := replace(v_def, 'p', 'q');
         v_b := replace(v_a, 'r', 's');
         execute v_b;
       end $m$;`, { restate: [], patch: [P('hr_h', 2)] }],
    ['a block-local constant holds the signature',
      `do $m$ declare c_sig constant text := 'public.hr_c(int)'; v_def text; begin
         v_def := pg_get_functiondef(c_sig::regprocedure);
         v_def := regexp_replace(v_def, 'a', 'b');
         execute v_def;
       end $m$;`, { restate: [], patch: [P('hr_c')] }],
    ['select … into',
      `do $m$ declare v_def text; begin
         select pg_get_functiondef('public.hr_s(int)'::regprocedure) into v_def;
         v_def := replace(v_def, 'a', 'b');
         execute v_def;
       end $m$;`, { restate: [], patch: [P('hr_s')] }],
  ];
  const refusals = [
    ['REFUSED: a §4 self-check that READS a body and never executes it',
      `do $m$ declare v_def text; begin
         v_def := pg_get_functiondef('public.hr_x(int)'::regprocedure);
         if strpos(v_def, 'recovering_until') = 0 then raise exception 'missing'; end if;
       end $m$;`],
    ['REFUSED: a normalising replace() on prosrc, not on a functiondef',
      `do $m$ declare v_src text; begin
         select prosrc into v_src from pg_proc where proname = 'hr_x';
         v_src := replace(v_src, chr(13), '');
         if v_src !~ 'version_conflict' then raise exception 'no'; end if;
       end $m$;`],
    ['REFUSED: pg_get_functiondef inside a COMMENT',
      `-- v_def := replace(pg_get_functiondef('public.hr_x(int)'::regprocedure), 'a', 'b');
       -- execute v_def;`],
    ['REFUSED: a hash probe in a comment (the shape every migration footer has)',
      `/* select md5(regexp_replace(pg_get_functiondef(
            'public.hr_x(int)'::regprocedure), '[[:space:]]+',' ','g')); */`],
    ['REFUSED: a CR strip and a whitespace collapse are normalisation, not edits',
      `do $m$ declare v_def text; v_norm text; begin
         v_def := pg_get_functiondef('public.hr_x(int)'::regprocedure);
         v_def := replace(v_def, chr(13), '');
         v_norm := regexp_replace(v_def, '[[:space:]]+', ' ', 'g');
         execute v_def;
       end $m$;`],
    ['REFUSED: a scratch normalisation that never reaches the execute',
      `do $m$ declare v_def text; v_hash text; begin
         v_def := pg_get_functiondef('public.hr_x(int)'::regprocedure);
         v_hash := replace(v_def, 'a', 'b');
         execute v_def;
       end $m$;`],
  ];
  for (const [label, sql, want] of cases) {
    const ev = eventsIn(sql);
    const gotR = ev.filter((e) => e.kind === 'restate').map((e) => e.fn);
    const gotP = ev.filter((e) => e.kind === 'patch');
    const wantP = want.patch.reduce((n, p) => n + p.patches, 0);
    const okFn = want.patch.every((p) => gotP.filter((g) => g.fn === p.fn).length === p.patches);
    say(String(gotR) === String(want.restate) && gotP.length === wantP && okFn,
      label, `  → ${gotP.length} patch(es) ${gotP.length ? '(' + [...new Set(gotP.map((g) => g.fn))].join(',') + ')' : ''} `
      + `${gotR.length} restatement(s); want ${wantP}/${want.restate.length}`);
  }
  for (const [label, sql] of refusals) {
    const ev = eventsIn(sql).filter((e) => e.kind === 'patch');
    say(ev.length === 0, label, `  → ${ev.length} patch(es)`);
  }

  console.log('\n  ── the COMPARATOR ──');
  if (!existsSync(BASELINE)) { console.error('SELFTEST: no baseline; run --write first.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const real = census(ROOT);
  const clean = compare(real, base);
  if (clean.problems.length) {
    console.error('SELFTEST HARNESS: the UNMUTATED tree already reports problems:');
    for (const p of clean.problems) console.error(`    ${p.check}  ${p.message}`);
    return 2;
  }
  console.log('  false-positive floor: the real repo reports 0 problems');

  const deepest = real.rows[0];
  const shallow = real.rows.find((r) => r.depth < MAX_CHAIN_DEPTH);
  if (!deepest || !shallow) {
    console.error('SELFTEST HARNESS: the repo has no deep chain and/or no shallow one to plant into.');
    return 2;
  }
  /** Plant a synthetic NEW migration at the end of the census. */
  const withNewFile = (name, patchedFn, count, ack) => {
    const c = JSON.parse(JSON.stringify({ rows: real.rows }));
    const perFile = new Map(real.perFile);
    const before = (real.rows.find((r) => r.fn === patchedFn) || { depth: 0 }).depth;
    perFile.set(name, {
      file: name, restated: [], ack: ack === undefined ? null : ack,
      patched: new Map([[patchedFn, { count, depthBefore: before }]]),
    });
    const rows = c.rows.map((r) => (r.fn === patchedFn
      ? { ...r, depth: r.depth + count, files: [...r.files, name] } : r));
    return compare({ rows, perFile, order: [...real.order, name], unordered: [] }, base);
  };

  const arms = [
    [`a NEW migration patches public.${deepest.fn} (chain ${deepest.depth}) with no ack`, 'PATCH-1',
      () => withNewFile('2026-09-30-planted.sql', deepest.fn, 1, null)],
    ['an anchored edit added to an EXISTING applied migration', 'PATCH-2', () => {
      const rows = real.rows.map((r) => (r.fn === deepest.fn ? { ...r, depth: r.depth + 1 } : r));
      return compare({ rows, perFile: real.perFile, order: real.order, unordered: [] }, base);
    }],
    ['a function the baseline never saw, already 2 patches deep', 'PATCH-3', () => {
      const rows = [...real.rows, {
        fn: 'hr_brand_new_body', depth: 3, files: ['2026-09-30-planted-a.sql', '2026-09-30-planted-b.sql'],
        totalPatches: 3, restatements: 0, lastRestatement: null, bulk: 0,
      }];
      const perFile = new Map(real.perFile);
      for (const f of ['2026-09-30-planted-a.sql', '2026-09-30-planted-b.sql']) {
        perFile.set(f, { file: f, restated: [], ack: null, patched: new Map() });
      }
      return compare({ rows, perFile, order: real.order, unordered: [] }, base);
    }],
    ['a RESTATEMENT-DEBT-ACK on a file that patches nothing', 'PATCH-4', () => {
      const perFile = new Map(real.perFile);
      perFile.set('2026-09-30-stale-ack.sql', {
        file: '2026-09-30-stale-ack.sql', restated: [], patched: new Map(),
        ack: { reason: 'this body is on the security hot path and cannot wait', ok: true },
      });
      return compare({ rows: real.rows, perFile, order: [...real.order, '2026-09-30-stale-ack.sql'], unordered: [] }, base);
    }],
    ['a migration that contributed a patch is deleted', 'PATCH-5', () => {
      const gone = deepest.files[0];
      const order = real.order.filter((f) => f !== gone);
      const perFile = new Map(real.perFile); perFile.delete(gone);
      const rows = real.rows.map((r) => ({ ...r, files: r.files.filter((f) => f !== gone) }));
      return compare({ rows, perFile, order, unordered: [] }, base);
    }],
    ['supabase/migrations emptied entirely', 'PATCH-5',
      () => compare({ rows: [], perFile: new Map(), order: [], unordered: [] }, base)],
    ['a RESTATEMENT-DEBT-ACK with a one-word reason', 'PATCH-4', () => {
      const perFile = new Map(real.perFile);
      perFile.set('2026-09-30-thin-ack.sql', {
        file: '2026-09-30-thin-ack.sql', restated: [], ack: { reason: 'urgent', ok: false },
        patched: new Map([[deepest.fn, { count: 1, depthBefore: deepest.depth }]]),
      });
      return compare({ rows: real.rows, perFile, order: [...real.order, '2026-09-30-thin-ack.sql'], unordered: [] }, base);
    }],
  ];
  for (const [label, check, mutate] of arms) {
    const got = mutate();
    const hit = got.problems.filter((p) => p.check === check);
    if (hit.length) console.log(`  CAUGHT   ${label}\n           ${check}: ${hit[0].message.split('. ')[0]}.`);
    else {
      bad++;
      console.log(`  MISSED   ${label} — ${check} never fired`
        + (got.problems.length ? ` (only: ${got.problems.map((p) => p.check).join(', ')})` : ' (no problem at all)'));
    }
  }

  const silent = [
    [`ALLOWED: a NEW migration patches public.${shallow.fn}, chain only ${shallow.depth} deep`,
      () => withNewFile('2026-09-30-shallow.sql', shallow.fn, 1, null)],
    [`ALLOWED: the deep chain is patched WITH a real ack`,
      () => withNewFile('2026-09-30-acked.sql', deepest.fn, 1,
        { reason: 'security hotfix on the money path; restatement is slice 7 and needs a GO', ok: true })],
  ];
  for (const [label, mutate] of silent) {
    const got = mutate();
    if (got.problems.length) {
      bad++;
      console.log(`  FALSE +  ${label} — reported ${got.problems.map((p) => p.check).join(', ')}`);
    } else console.log(`  silent   ${label}`);
  }

  // slice 7 restating a body must be a NOTE, never a failure
  const restated = (() => {
    const rows = real.rows.map((r) => (r.fn === deepest.fn
      ? { ...r, depth: 0, files: [], lastRestatement: '2026-09-30-restate-' + deepest.fn + '.sql' } : r));
    return compare({ rows, perFile: real.perFile, order: real.order, unordered: [] }, base);
  })();
  if (restated.problems.length) {
    bad++;
    console.log(`  FALSE +  SLICE 7: public.${deepest.fn} restated — reported `
      + restated.problems.map((p) => p.check).join(', ') + '; paying the debt must be a NOTE');
  } else if (!restated.notes.some((n) => n.includes(deepest.fn))) {
    bad++;
    console.log(`  SILENT   SLICE 7: public.${deepest.fn} restated — no note, so nobody re-runs --write`);
  } else console.log(`  note     SLICE 7: public.${deepest.fn} restated (${deepest.depth} → 0)`);

  // the ack reader, on real text
  const ackCases = [
    ['-- RESTATEMENT-DEBT-ACK: a real reason, at least twenty characters long', true, true],
    ['-- RESTATEMENT-DEBT-ACK: urgent', true, false],
    ['-- nothing to see here', false, false],
  ];
  for (const [line, present, ok] of ackCases) {
    const a = ackOf(line + '\n');
    say(!!a === present && (!a || a.ok === ok), `ack reader: ${JSON.stringify(line.slice(0, 46))}`,
      `  → ${a ? `present, ok=${a.ok}` : 'absent'}`);
  }

  // ── END TO END, ON REAL FILES ────────────────────────────────────────────
  // Everything above bends objects, which proves the comparator and the reader
  // separately. This proves the thing that actually runs: a temp root with real
  // .sql files and a real apply-order.json, walked by census(), the ack read off
  // real file text, and the verdict taken from compare(). If the plumbing that
  // joins the two halves is broken, every arm above still passes.
  console.log('\n  ── END TO END (a temp migrations tree, real files) ──');
  const tmp = mkdtempSync(join(tmpdir(), 'hr-patchchain-'));
  try {
    const mig = join(tmp, 'supabase', 'migrations');
    mkdirSync(mig, { recursive: true });
    mkdirSync(join(tmp, 'tests'), { recursive: true });
    const patchFile = (fn, n, header = '') => `${header}do $m$ declare v_def text; begin\n`
      + `  v_def := pg_get_functiondef('public.${fn}(int)'::regprocedure);\n`
      + Array.from({ length: n }, (_, i) => `  v_def := replace(v_def, 'a${i}', 'b${i}');\n`).join('')
      + '  execute v_def;\nend $m$;\n';

    const files = {
      '0001-base.sql': 'create or replace function public.hr_demo(a int) returns int\n'
        + 'language plpgsql as $$ begin return a; end $$;\n',
      '0002-first.sql': patchFile('hr_demo', 1),
      '0003-second.sql': patchFile('hr_demo', 1),
    };
    const order = ['0001-base.sql', '0002-first.sql', '0003-second.sql'];
    const writeTree = (extra = {}, ord = order) => {
      for (const f of readdirSync(mig)) rmSync(join(mig, f));
      for (const [n, t] of Object.entries({ ...files, ...extra })) writeFileSync(join(mig, n), t);
      writeFileSync(join(tmp, 'tests', 'schema-apply-order.json'),
        JSON.stringify({ order: [...ord, ...Object.keys(extra)] }, null, 2));
    };

    writeTree();
    const c0 = census(tmp);
    const demo0 = c0.rows.find((r) => r.fn === 'hr_demo');
    say(demo0 && demo0.depth === 2 && demo0.lastRestatement === '0001-base.sql',
      'census() on real files: hr_demo restated once, then 2 patches',
      `  → depth ${demo0 ? demo0.depth : 'n/a'}, last ${demo0 ? demo0.lastRestatement : 'n/a'}`);

    const b0 = { maxChainDepth: MAX_CHAIN_DEPTH, knownMigrations: c0.order,
      chains: { hr_demo: { depth: demo0.depth, files: demo0.files, lastRestatement: demo0.lastRestatement } } };
    say(compare(c0, b0).problems.length === 0, 'the fixture is green against its own baseline');

    writeTree({ '0004-third.sql': patchFile('hr_demo', 1) });
    const red = compare(census(tmp), b0);
    say(red.problems.some((p) => p.check === 'PATCH-1'),
      'a REAL new migration file patching a 2-deep chain is caught',
      `  → ${red.problems.map((p) => p.check).join(',') || 'nothing'}`);

    writeTree({ '0004-third.sql': patchFile('hr_demo', 1,
      '-- RESTATEMENT-DEBT-ACK: security hotfix on the money path, restatement is slice 7\n') });
    const acked = compare(census(tmp), b0);
    say(acked.problems.length === 0 && acked.notes.some((n) => n.includes('RESTATEMENT-DEBT-ACK')),
      'the same file WITH a real ack in its header is allowed, and noted',
      `  → ${acked.problems.length} problem(s)`);

    writeTree({ '0004-third.sql': 'create or replace function public.hr_demo(a int) returns int\n'
      + 'language plpgsql as $$ begin return a + 1; end $$;\n' });
    const rest = compare(census(tmp), b0);
    say(rest.problems.length === 0 && rest.notes.some((n) => n.includes('hr_demo')),
      'RESTATING the body instead is green, with a "run --write" note',
      `  → ${rest.problems.length} problem(s), ${rest.notes.length} note(s)`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  console.log(`\n  ${bad ? `${bad} arm(s) FAILED`
    : `${cases.length} reader shapes read correctly and ${refusals.length} refused, all ${arms.length} `
      + `defects caught by their named assertion, ${silent.length} legal cases silent, a restatement `
      + 'reported as a note, and the whole path proven end to end on real files'}`);
  return bad ? 1 : 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/patch-chain-guard.mjs')) {
  process.exit(process.argv.includes('--selftest') ? selftest() : run(process.argv.slice(2)));
}
