// ════════════════════════════════════════════════════════════════════════
// tests/selfcheck-no-global-dml.mjs — A MIGRATION MAY NOT DELETE A ROW IT
// DID NOT CREATE.
//
//   node tests/selfcheck-no-global-dml.mjs            the guard (no DB, no credential)
//   node tests/selfcheck-no-global-dml.mjs --list     every finding and its verdict
//   node tests/selfcheck-no-global-dml.mjs --selftest plant the defects, require each caught
//
// ── THE INCIDENT ────────────────────────────────────────────────────────────
// 2026-09-20 15:41 UTC. 2026-09-19-lifetime-facts-off-the-ledger.sql was applied
// to production and REFUSED, atomically, with no damage:
//
//   ERROR 23514  player_ledger row is inside the 90 day retention window and
//                cannot be deleted
//   CONTEXT      PL/pgSQL function hr_ledger_immutable() line 7 at RAISE
//                SQL statement "delete from public.player_ledger
//                               where at < now() - interval '1 day'"
//                PL/pgSQL function inline_code_block line 177
//
// That statement is a section-4 SELF-CHECK. It was simulating the 90-day
// retention prune so the migration could prove that three lifetime facts still
// answer after their ledger rows age out — and it simulated it by deleting
// EVERY PLAYER'S LEDGER ROWS older than a day. Two defects, and the second is
// much the worse:
//
//   1. It cannot run where the immutability trigger is armed and real rows
//      exist. hr_ledger_immutable refuses a delete inside the retention window,
//      correctly, so the apply failed.
//   2. A self-check may not touch a row it did not create — ROLLED BACK OR NOT.
//      player_ledger is the money journal and the append-only audit trail of
//      every value movement in the game. The trigger refusing was LUCK: every
//      fixture row in that block was dated 120–200 days back, i.e. OUTSIDE the
//      window and therefore deletable, so on a production ledger that had
//      reached its first prune date (~2026-11-21) the aged tail of every
//      player's history would have been deleted by a self-check that then
//      reported "all gates passed".
//
// Nothing in the repo could see it. tests/schema-drift.mjs replays the chain
// into a FRESH database whose player_ledger holds nothing but the fixture rows
// the block itself writes, so a blanket delete and a probe-scoped one are
// indistinguishable there. (Measured 2026-09-20: with the bystander seed added
// to schema-drift, both shapes are now caught; without it, both apply cleanly
// and that guard reports OK.)
//
// ── WHAT THIS READS, AND THE RULE ───────────────────────────────────────────
// Every .sql in supabase/migrations/. Inside every `do $tag$ … $tag$` block —
// with comments, string literals and NESTED dollar-quoted bodies (the function
// text an anchored patch builds) blanked out, so only code the block itself
// EXECUTES is read — it finds:
//
//   dml   a DELETE / UPDATE / TRUNCATE naming a PLAYER-VALUE TABLE, whose
//         predicate does not bind an owner column (user_id, clan_id, id, …) to
//         a variable the block itself declared. "Scoped to the rows I created"
//         is exactly that shape, and nothing else is.
//   call  a call to a function the chain defines whose own body deletes from a
//         player-value table with no owner predicate — i.e. a retention prune,
//         global by construction. The class one level down: 2026-09-18-ledger-
//         rollup-currencies.sql passes `perform public.hr_ledger_prune(20000)`
//         inside its self-check, which on a production ledger past its first
//         prune date reaches every player's aged rows.
//
// The player-value table list is NOT maintained here. It is
// `player_value_tables` in tests/restore-census.baseline.json — the argued,
// guarded manifest of the tables whose rows only a backup gives back — so a new
// table becomes covered by being classified there once, and cannot be quietly
// dropped from this guard's reach without failing that one.
// The global-DML function list is DERIVED from the chain on every run, never
// typed: a new prune function is in scope the day it is written.
//
// ── ACKNOWLEDGEMENTS, AND WHY THEY CANNOT ROT ───────────────────────────────
// Three findings are legitimate and are named below. They are one-time
// BACKFILLS — the migration's actual work, not a self-check — in files that are
// already APPLIED, so they are listed and not edited (CLAUDE.md §2: production
// is written by the Coordinator, and an applied file is history).
// One file is acknowledged on different grounds: it narrows the prune's reach
// before calling it and proves the narrowing with its own gates. That kind of
// acknowledgement carries `proof` strings that must still be PRESENT in the
// file; delete the narrowing and the acknowledgement stops matching, which is
// red. And an acknowledgement that matches NO finding is also red, so the list
// cannot accumulate entries that describe code nobody kept.
//
// Exit: 0 green · 1 an unacknowledged global statement, or a stale/unused
// acknowledgement · 2 harness (the census manifest is unreadable, or
// --selftest could not plant a defect).
// ════════════════════════════════════════════════════════════════════════

import { readFile, readdir } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIGDIR = join(ROOT, 'supabase', 'migrations');
const CENSUS = join(ROOT, 'tests', 'restore-census.baseline.json');
const argv = process.argv.slice(2);

// Owner columns: the columns that identify WHOSE row this is. `id` is in the
// list because a block that captured the id of a row it just inserted is scoped
// by construction — that is how 2026-08-11-player-state.sql's own probes work.
const OWNER = '(?:user_id|clan_id|owner_id|character_id|listing_id|offer_id|seller_id|buyer_id|id)';

// The vocabulary the right-hand side of a binding may use WITHOUT being a
// reference to another column: cast targets, the array spellings, the literals.
// Anything else that is not a name the block declared means the owner column is
// bound to the TABLE rather than to a row the block created.
const BIND_VOCAB = new Set([
  'any', 'all', 'array', 'null', 'true', 'false', 'coalesce', 'nullif', 'greatest', 'least',
  'uuid', 'text', 'citext', 'varchar', 'char', 'name', 'int', 'int2', 'int4', 'int8',
  'integer', 'bigint', 'smallint', 'numeric', 'decimal', 'boolean', 'bool', 'real',
  'float4', 'float8', 'double', 'precision', 'timestamptz', 'timestamp', 'date', 'time',
  'interval', 'json', 'jsonb', 'bytea',
]);

// `auth.uid()` is the caller's own identity — the strongest owner binding there
// is, and the shape every per-user RPC in the chain is written with.
const SELF_BIND = /\bauth\s*\.\s*uid\s*\(\s*\)/i;

// ── Lexing: what the block actually EXECUTES ───────────────────────────────
/** Blank `--` and /* *\/ comments and the inside of every '…' literal. Lengths
 *  are preserved so offsets still map to line numbers in the original text. */
function blankLiterals(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith('--', i)) {
      let j = s.indexOf('\n', i); if (j < 0) j = s.length;
      out.push(' '.repeat(j - i)); i = j;
    } else if (s.startsWith('/*', i)) {
      let j = s.indexOf('*/', i + 2); j = j < 0 ? s.length : j + 2;
      out.push(s.slice(i, j).replace(/[^\n]/g, ' ')); i = j;
    } else if (s[i] === "'") {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "'") { if (s[j + 1] === "'") { j += 2; continue; } break; }
        j++;
      }
      j = Math.min(j, s.length - 1);
      out.push(`'${s.slice(i + 1, j).replace(/[^\n]/g, ' ')}'`); i = j + 1;
    } else { out.push(s[i]); i++; }
  }
  return out.join('');
}

/** Blank every nested $tag$…$tag$ run. Inside a DO block that is the TEXT of a
 *  function the block installs — read by `execute`, not run by the block — and
 *  reading it here produced three false findings on hr_apply's own body. */
function blankNested(body) {
  const out = [];
  let i = 0;
  const tagRe = /\$[A-Za-z_0-9]*\$/y;
  while (i < body.length) {
    tagRe.lastIndex = i;
    const m = tagRe.exec(body);
    if (m) {
      const end = body.indexOf(m[0], i + m[0].length);
      if (end >= 0) {
        const stop = end + m[0].length;
        out.push(body.slice(i, stop).replace(/[^\n]/g, ' ')); i = stop; continue;
      }
    }
    out.push(body[i]); i++;
  }
  return out.join('');
}

/** Top-level `do $tag$ … $tag$` blocks, as {at, raw} into the lexed text.
 *  `raw` keeps the nested dollar-quotes: executePayloads() needs them, and the
 *  direct DML scan blanks them itself. */
function doBlocks(sql) {
  const res = [];
  const re = /(?:^|[\s;])do\s+(\$[A-Za-z_0-9]*\$)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const tag = m[1];
    const end = sql.indexOf(tag, m.index + m[0].length);
    if (end < 0) continue;
    const at = m.index + m[0].length;
    res.push({ at, raw: sql.slice(at, end) });
    re.lastIndex = end;
  }
  return res;
}

/** The single-quoted literal starting at `at`, with '' unescaped. `sql` here is
 *  the RAW text — blankLiterals() has not been run, or there is nothing to read. */
function literalAt(s, at) {
  let out = '';
  let i = at + 1;
  while (i < s.length) {
    if (s[i] === "'") { if (s[i + 1] === "'") { out += "'"; i += 2; continue; } return { text: out, end: i + 1 }; }
    out += s[i]; i++;
  }
  return { text: out, end: s.length };
}

/**
 * S-SC-1 family A: what a block's `execute` statements actually run.
 *
 * `execute` is the one verb whose STRING LITERAL is executed code, and
 * blankLiterals() blanks precisely that text — so the 2026-09-20 statement,
 * handed to `execute` as a literal, was the one shape the guard was guaranteed
 * not to read. Resolve every payload that CAN be read (a literal, a
 * dollar-quoted body, a format() over a literal template with literal
 * arguments) and hand it back as code for the ordinary DML scan.
 *
 * What cannot be read is reported, unless the block proves it is DDL: the
 * anchored-patch files assemble a function body with pg_get_functiondef() and
 * `execute` it, which installs code rather than running DML, and that body is
 * pass 1's subject anyway. `refuse what you cannot read` is the safe half of
 * the required change; `read what you can` is the other.
 */
function executePayloads(rawBlock) {
  const out = [];
  const lexed = blankNested(blankLiterals(rawBlock));   // comments gone: prose cannot look like code
  const { ddl, literal } = tracedNames(rawBlock, lexed);
  for (const m of lexed.matchAll(/(?:^|[\s;()])execute\b/gi)) {
    const at = m.index + m[0].length;
    if (/^\s*on\s+(?:function|procedure|routine|all|table|sequence)\b/i.test(lexed.slice(at, at + 40))) continue;
    // `create [event] trigger … execute function f()` spells a trigger body, not
    // a dynamic statement, and `grant execute on …` is a privilege.
    if (/^\s*(?:function|procedure)\b/i.test(lexed.slice(at, at + 20))) continue;
    const semi = lexed.indexOf(';', at);
    const stop = semi < 0 ? rawBlock.length : semi;
    // `execute <expr> [into …] [using …]` — the tails are outputs and binds.
    const tail = lexed.slice(at, stop).search(/\b(?:into|using)\b/i);
    const end2 = tail < 0 ? stop : at + tail;
    const expr = rawBlock.slice(at, end2).trim();
    const lex = lexed.slice(at, end2);

    // Installing code is not running DML, and the body installed is pass 1's
    // subject. Traced to the assignment, never assumed from the variable name.
    if (/\bpg_get_functiondef\b/i.test(expr) || [...ddl].some((d) => new RegExp(`\\b${d}\\b`, 'i').test(lex))) continue;

    const parts = readableParts(expr);
    const named = /^([a-z_][a-z0-9_]*)$/i.exec(expr);
    if (named && literal.has(named[1].toLowerCase())) {
      out.push({ at: m.index, code: literal.get(named[1].toLowerCase()) });
    } else if (/^format\s*\(/i.test(expr)) {
      const code = renderFormat(balanced(expr, expr.indexOf('(')));
      out.push({ at: m.index, code });
    } else if (parts !== null) {
      out.push({ at: m.index, code: parts });
    } else {
      out.push({ at: m.index, code: null });            // refused: it cannot be read
    }
  }
  return out;
}

/** Every literal and dollar-quoted run in an expression, concatenated — what
 *  `execute 'delete from x where id = ' || v_id` actually starts with. null when
 *  the expression carries no readable text at all. */
function readableParts(expr) {
  let out = '';
  let seen = false;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "'") { const l = literalAt(expr, i); out += `${l.text} `; i = l.end - 1; seen = true; continue; }
    const tag = /^\$[A-Za-z_0-9]*\$/.exec(expr.slice(i));
    if (tag) {
      const e = expr.indexOf(tag[0], i + tag[0].length);
      if (e >= 0) { out += `${expr.slice(i + tag[0].length, e)} `; i = e + tag[0].length - 1; seen = true; continue; }
    }
  }
  return seen ? out : null;
}

/**
 * What the block's names hold, traced to their assignments rather than guessed
 * from their spelling.
 *
 *   ddl      names whose every assignment has DDL provenance — `v_def :=
 *            pg_get_functiondef(…)` and the `v_new := replace(v_def, …)` chain
 *            the anchored-patch files are written in. Such an `execute`
 *            INSTALLS code; the body it installs is pass 1's subject.
 *   literal  names assigned exactly one readable constant, so an `execute` of
 *            them can be scanned as the code it is.
 *
 * Statement boundaries come from the LEXED text (a dollar-quoted function body
 * is full of semicolons, and splitting on those walks off the end of the
 * assignment); the text itself is read RAW. blankLiterals() and blankNested()
 * both preserve length, so the two are the same string by offset.
 */
function tracedNames(rawBlock, lexed) {
  const asg = [];
  const push = (name, from, to) => asg.push({ name: name.toLowerCase(), rhs: rawBlock.slice(from, to) });
  for (const m of lexed.matchAll(/\b([a-z_][a-z0-9_]*)\s*:=/gi)) {
    const from = m.index + m[0].length;
    const semi = lexed.indexOf(';', from);
    push(m[1], from, semi < 0 ? rawBlock.length : semi);
  }
  // `select pg_get_functiondef(…) into v_src;` is the same assignment written
  // the other way round, and it is how most of this chain reads a body.
  for (const m of lexed.matchAll(/\binto\s+(?:strict\s+)?([a-z_][a-z0-9_]*)/gi)) {
    if (/\binsert\s+$/i.test(lexed.slice(Math.max(0, m.index - 10), m.index))) continue;
    const open = lexed.lastIndexOf(';', m.index) + 1;
    const semi = lexed.indexOf(';', m.index);
    push(m[1], open, semi < 0 ? rawBlock.length : semi);
  }
  const seeds = (rhs) => /\bpg_get_functiondef\b/i.test(rhs)
    || /^\s*'?\s*(?:create|alter|drop|comment|grant|revoke)\b/i.test(rhs);
  const mentions = (rhs, set) => [...set].some((d) => new RegExp(`\\b${d}\\b`, 'i').test(rhs));

  const ddl = new Set();
  for (let pass = 0; pass < 8; pass++) {
    const before = ddl.size;
    for (const a of asg) if (!ddl.has(a.name) && (seeds(a.rhs) || mentions(a.rhs, ddl))) ddl.add(a.name);
    if (ddl.size === before) break;
  }
  // A name ALSO assigned something with no DDL provenance is not one: the
  // waiver may not be inherited by a variable reused for anything else. A
  // self-reference (`v_def := replace(v_def, …)`) carries it forward.
  for (const a of asg) {
    if (ddl.has(a.name) && !seeds(a.rhs) && !mentions(a.rhs, ddl)) ddl.delete(a.name);
  }

  const literal = new Map();
  const seenTwice = new Set();
  for (const a of asg) {
    if (ddl.has(a.name)) continue;
    if (literal.has(a.name)) { seenTwice.add(a.name); continue; }
    const text = readableParts(a.rhs.trim());
    if (text !== null) literal.set(a.name, text);
  }
  for (const n of seenTwice) literal.delete(n);
  return { ddl, literal };
}

/** `format('delete from %I where …', 'player_ledger')` → the statement it
 *  builds. Literal arguments are substituted in order; a non-literal argument
 *  becomes a name that matches no table, which is honest — the guard reports
 *  what it can read and refuses what it cannot. */
function renderFormat(call) {
  const inner = call.slice(1, -1);
  let depth = 0, last = 0;
  const args = [];
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    const skip = skipQuoted(inner, i);
    if (skip > i) { i = skip - 1; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { args.push(inner.slice(last, i)); last = i + 1; }
  }
  args.push(inner.slice(last));
  const head = args.shift().trim();
  let tmpl = null;
  if (head.startsWith("'")) tmpl = literalAt(head, 0).text;
  else {
    // format($fmt$ … $fmt$, …) — the template is dollar-quoted, which is how
    // this chain writes a template that itself contains quotes.
    const tag = /^\$[A-Za-z_0-9]*\$/.exec(head);
    const e = tag ? head.indexOf(tag[0], tag[0].length) : -1;
    if (e >= 0) tmpl = head.slice(tag[0].length, e);
  }
  if (tmpl === null) return null;
  let n = 0;
  return tmpl.replace(/%[IiLs]/g, () => {
    const a = (args[n++] || '').trim();
    // A literal argument substitutes its text; anything else substitutes the
    // EXPRESSION, so `where user_id = %L` over v_uid still reads as the binding
    // it is. A placeholder here would throw away the one thing being asked.
    return a.startsWith("'") ? literalAt(a, 0).text : a;
  });
}

/**
 * S-SC-1 family D: every executable body the FILE installs and then calls.
 *
 * Pass 2 used to iterate `do $tag$` blocks alone, so a self-check written as
 * `create function pg_temp.sc() … ; select pg_temp.sc();` was never scanned at
 * all — the container, not the statement, decided whether the rule applied.
 */
function* installedAndCalled(sql, globalFns) {
  for (const fn of installedFunctions(sql)) {
    // A chain function pass 1 has already classed global is reported at its CALL
    // sites, which is where the decision to run it was made. Scanning its body
    // here as well would report the function's own definition as a self-check.
    if (globalFns.has(fn.name)) continue;
    const call = new RegExp(`\\b(?:select|perform|call)\\s+(?:public\\.|pg_temp\\.)?${fn.name}\\s*\\(`, 'i');
    const outside = sql.slice(0, fn.at) + sql.slice(fn.at + fn.body.length);
    if (call.test(outside)) yield fn;
  }
}

/** Every name the block declares: `declare … begin` sections and loop targets. */
function localsOf(body) {
  const names = new Set();
  for (const m of body.matchAll(/\bdeclare\b([\s\S]*?)\bbegin\b/gi)) {
    for (const chunk of m[1].split(';')) {
      const n = /^\s*([a-z_][a-z0-9_]*)\s+\S/i.exec(chunk);
      if (n) names.add(n[1].toLowerCase());
    }
  }
  for (const m of body.matchAll(/\bfor\s+([a-z_][a-z0-9_]*)\s+in\b/gi)) names.add(m[1].toLowerCase());
  for (const m of body.matchAll(/\bforeach\s+([a-z_][a-z0-9_]*)\b/gi)) names.add(m[1].toLowerCase());
  return names;
}

const DML = /\b(delete\s+from|truncate(?:\s+table)?|update)\s+(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;

/** The balanced `( … )` group starting at `at`, parens included. A paren inside
 *  a quoted literal or a dollar-quoted body is text, not structure. */
function balanced(s, at) {
  let depth = 0;
  for (let i = at; i < s.length; i++) {
    const skip = skipQuoted(s, i);
    if (skip > i) { i = skip - 1; continue; }
    if (s[i] === '(') depth++;
    else if (s[i] === ')') { depth--; if (depth === 0) return s.slice(at, i + 1); }
  }
  return s.slice(at);
}

/** If a quoted run starts at `i`, the index just past it; otherwise `i`. */
function skipQuoted(s, i) {
  if (s[i] === "'") return literalAt(s, i).end;
  const tag = /^\$[A-Za-z_0-9]*\$/.exec(s.slice(i));
  if (tag) {
    const e = s.indexOf(tag[0], i + tag[0].length);
    if (e >= 0) return e + tag[0].length;
  }
  return i;
}

/** The right-hand side of `owner = …`, cut where the next conjunct or clause
 *  begins so a binding cannot borrow a local from an unrelated later term. */
function cutArg(s, from) {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '(') { depth++; continue; }
    if (c === ')') { if (depth === 0) return s.slice(from, i); depth--; continue; }
    if (c === ';') { if (depth === 0) return s.slice(from, i); continue; }
    if (depth !== 0) continue;
    if (/[a-z_]/i.test(c) && !/[a-z0-9_.$]/i.test(s[i - 1] || ' ')
        && /^(?:and|or|order|group|having|limit|returning|using|from|window|offset|fetch)\b/i.test(s.slice(i, i + 10))) {
      return s.slice(from, i);
    }
  }
  return s.slice(from);
}

/**
 * Is `arg` — the right-hand side of an owner binding — built ONLY out of names
 * the block declared? Casts, numbers and the null/bool literals ride along. A
 * reference to another COLUMN does not, and neither does a subselect: both bind
 * the owner column to the table rather than to a row this block created.
 * `v_row.user_id` IS allowed — `v_row` is a declared record.
 */
function argIsOwned(arg, locals) {
  if (/\bselect\b/i.test(arg)) return false;
  if (SELF_BIND.test(arg)) return true;
  let owned = false;
  let alien = false;
  const s = arg
    .replace(/::\s*[a-z_][a-z0-9_]*(?:\s*\[\s*\])?/gi, ' ')           // casts
    .replace(/'[^']*'/g, ' ')                                          // literals
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')                                // numbers
    .replace(/\b([a-z_][a-z0-9_]*)\s*\.\s*[a-z_][a-z0-9_]*\b/gi, (_all, q) => {
      if (locals.has(q.toLowerCase())) owned = true; else alien = true;  // a record field vs a column
      return ' ';
    });
  if (alien) return false;
  for (const m of s.matchAll(/\b[a-z_][a-z0-9_]*\b/gi)) {
    const w = m[0].toLowerCase();
    if (locals.has(w)) { owned = true; continue; }
    if (BIND_VOCAB.has(w)) continue;
    return false;
  }
  return owned;
}

/** The statement's OWN predicate: the text after its first `where` at depth 0.
 *  A `where` inside a subselect (`set gems = (select … where slot_id = 3)`) is
 *  that subselect's, and splitting on the first one found anywhere reads the
 *  wrong clause — and then misses the real owner binding behind it. */
function predicateOf(stmt) {
  let depth = 0;
  for (let i = 0; i < stmt.length; i++) {
    const c = stmt[i];
    if (c === '(') { depth++; continue; }
    if (c === ')') { depth--; continue; }
    if (c === ';' && depth === 0) return null;
    if (depth !== 0) continue;
    if (/[a-z_]/i.test(c) && !/[a-z0-9_.$]/i.test(stmt[i - 1] || ' ')
        && /^where\b/i.test(stmt.slice(i, i + 6))) {
      return stmt.slice(i + 5);
    }
  }
  return null;
}

/**
 * Every owner binding in `pred` AT PARENTHESIS DEPTH 0, and whether a top-level
 * `or` widens the reach past them. Depth matters: `where (user_id = v_uid or
 * kind = 'x')` binds nothing, and an owner column inside an `exists ( … )`
 * subquery constrains the subquery, not the statement.
 */
function ownerBinds(pred) {
  const binds = [];
  let topOr = false;
  const own = new RegExp(`(?:[a-z_][a-z0-9_]*\\s*\\.\\s*)?${OWNER}`, 'iy');
  let depth = 0;
  for (let i = 0; i < pred.length; i++) {
    const c = pred[i];
    if (c === '(') { depth++; continue; }
    if (c === ')') { depth--; continue; }
    if (depth !== 0) continue;
    if (!/[a-z_]/i.test(c) || /[a-z0-9_.$]/i.test(pred[i - 1] || ' ')) continue;
    if (/^or\b/i.test(pred.slice(i, i + 3))) { topOr = true; continue; }
    own.lastIndex = i;
    const m = own.exec(pred);
    if (!m) continue;
    let j = i + m[0].length;
    if (/[a-z0-9_]/i.test(pred[j] || '')) continue;               // user_ids is not user_id
    while (j < pred.length && /\s/.test(pred[j])) j++;
    if (pred[j] === '=' && pred[j + 1] !== '=') {
      j++;
      while (j < pred.length && /\s/.test(pred[j])) j++;
      binds.push(cutArg(pred, j));
    } else if (/^in\b/i.test(pred.slice(j, j + 3))) {
      j += 2;
      while (j < pred.length && /\s/.test(pred[j])) j++;
      if (pred[j] === '(') binds.push(balanced(pred, j));
    }
    i = Math.max(i, j - 1);
  }
  return { binds, topOr };
}

/**
 * Does this statement bind an owner column to a name the block declared?
 *
 * S-SC-1 family B (2026-09-20 security review). The answer used to be "SOME
 * declared name occurs within 90 characters after SOME owner column", which
 * reads `where id is not null and at < v_cut` — a blanket prune — as "scoped to
 * a row I created", because `id` is an owner column and `v_cut` is a local.
 * The binding must now be REAL: an owner column at depth 0, bound by `=`,
 * `in ( … )` or `= any( … )`, to an expression made only of declared names,
 * with no top-level `or` widening the reach past it. A join predicate
 * (`s.user_id = p.user_id`) binds a column to a column and is not a binding.
 */
function isScoped(stmt, locals) {
  const pred = predicateOf(stmt);
  if (pred === null) return false;
  const { binds, topOr } = ownerBinds(pred);
  if (topOr) return false;
  return binds.some((b) => argIsOwned(b, locals));
}

/** The parameter names a function is GIVEN. A predicate bound to one of these
 *  is bound to what the caller handed in, which is the function-level form of
 *  "a row I created". */
function paramsOf(argList) {
  const names = new Set();
  const args = argList.replace(/^\s*\(/, '').replace(/\)\s*$/, '');
  let depth = 0, last = 0;
  const chunks = [];
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { chunks.push(args.slice(last, i)); last = i + 1; }
  }
  chunks.push(args.slice(last));
  for (const chunk of chunks) {
    const n = /^\s*(?:in|out|inout|variadic)?\s*([a-z_][a-z0-9_]*)\s+\S/i.exec(chunk);
    if (n && !BIND_VOCAB.has(n[1].toLowerCase())) names.add(n[1].toLowerCase());
  }
  return names;
}

/** Every function the file installs: its name, its body, and every name that
 *  body may legitimately bind an owner column to (its parameters and its own
 *  declares). `sql` must already be lexed by blankLiterals(). */
function* installedFunctions(sql) {
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:(?:public|pg_temp)\.)?([a-z_][a-z0-9_]*)\s*(?=\()/gi)) {
    const args = balanced(sql, m.index + m[0].length);
    const dm = /\$[A-Za-z_0-9]*\$/.exec(sql.slice(m.index));
    if (!dm) continue;
    const bodyAt = m.index + dm.index + dm[0].length;
    const end = sql.indexOf(dm[0], bodyAt);
    if (end < 0) continue;
    const body = sql.slice(bodyAt, end);
    const params = paramsOf(args);
    const given = new Set([...localsOf(body), ...params]);
    // A trigger is handed its row. `new`/`old` are the given names there, and
    // `where ps.user_id = new.user_id` is the per-row shape, not a global one.
    if (/returns\s+trigger/i.test(sql.slice(m.index, bodyAt))) { given.add('new'); given.add('old'); }
    yield { name: m[1].toLowerCase(), at: bodyAt, body, given, params };
  }
}

/**
 * `insert … select … on conflict … do update` over a player-value table.
 *
 * S-SC-1 family C: this reaches — and re-dates — every row its SELECT returns,
 * which is the same blast radius as a blanket UPDATE. A `values` list is left
 * alone: it is bounded by what the caller handed in. This is the shape of
 * hr_backfill_lifetime_facts()'s step (3), the instance that was sitting in the
 * tree, inside the very file the 2026-09-20 incident was about.
 */
function* upserts(body, playerTables) {
  for (const m of body.matchAll(/\binsert\s+into\s+(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    const table = m[1].toLowerCase();
    if (!playerTables.has(table)) continue;
    const semi = body.indexOf(';', m.index);
    const stmt = body.slice(m.index, semi < 0 ? body.length : semi);
    const oc = stmt.search(/\bon\s+conflict\b/i);
    if (oc < 0 || !/\bdo\s+update\b/i.test(stmt.slice(oc))) continue;
    if (!/\bselect\b/i.test(stmt.slice(0, oc))) continue;
    yield { table, stmt };
  }
}

/** Was this call SCOPED — did it hand the function an owner the caller owns?
 *  A function with an optional scope parameter is global only when called
 *  without one, so `hr_backfill_lifetime_facts(v_uid)` and
 *  `hr_backfill_lifetime_facts()` are different statements and are read as such. */
function callIsScoped(text, openAt, info, locals) {
  if (!info.scopeParam) return false;
  const args = balanced(text, openAt);
  return argIsOwned(args.slice(1, -1), locals);
}

const squeeze = (stmt) => stmt.replace(/\s+/g, ' ').trim().slice(0, 120);

/**
 * The first statement in `body` that reaches rows the body was not given —
 * i.e. what makes a function global BY CONSTRUCTION. A prune DELETEs, a
 * backfill UPDATEs or upserts; before the 2026-09-20 review this read DELETE
 * only, and `if (verb === 'update') continue;` is exactly why the guard written
 * for the incident could not see the call sitting in the incident's own file.
 */
function globalStatement(body, given, params, playerTables) {
  DML.lastIndex = 0;
  const found = (verb, stmt) => ({ verb, stmt: squeeze(stmt), scopeParam: scopeParamOf(stmt, params) });
  for (const d of body.matchAll(DML)) {
    const verb = d[1].split(/\s+/)[0].toLowerCase();
    if (!playerTables.has(d[2].toLowerCase())) continue;
    const semi = body.indexOf(';', d.index);
    const stmt = body.slice(d.index, semi < 0 ? body.length : semi);
    if (verb !== 'truncate' && isScoped(stmt, given)) continue;
    return found(verb, stmt);
  }
  for (const u of upserts(body, playerTables)) {
    if (isScoped(u.stmt, given)) continue;
    return found('upsert', u.stmt);
  }
  return null;
}

/**
 * An OPTIONAL owner-scope parameter: `(p_user is null or l.user_id = p_user)`.
 * A function written this way is global only when it is CALLED without one, so
 * the call site — not the body — is where the decision was made. Named so a
 * scoped call can be told from a blanket one instead of both reading the same.
 */
function scopeParamOf(stmt, params) {
  for (const prm of params) {
    const re = new RegExp(`\\b${prm}\\s+is\\s+null\\s+or\\b[^)]{0,120}?`
      + `(?:[a-z_][a-z0-9_]*\\s*\\.\\s*)?${OWNER}\\s*=\\s*${prm}\\b`, 'i');
    if (re.test(stmt)) return prm;
  }
  return null;
}

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

/**
 * The scan. PURE: takes the sources and the table manifest, returns findings —
 * so --selftest can plant a defect in a COPY and never write to the repo.
 * @param {Map<string,string>} sources filename -> SQL
 * @param {Set<string>} playerTables
 */
export function scan(sources, playerTables) {
  // ── Pass 1: which functions in the chain are global-DML by construction? ──
  const globalFns = new Map();     // name -> {file, stmt}
  for (const [file, raw] of sources) {
    const sql = blankLiterals(raw.replace(/\r\n/g, '\n'));
    for (const fn of installedFunctions(sql)) {
      const g = globalStatement(fn.body, fn.given, fn.params, playerTables);
      if (g && !globalFns.has(fn.name)) {
        globalFns.set(fn.name, { file, stmt: g.stmt, scopeParam: g.scopeParam });
      }
    }
  }

  // ── Pass 2: every executable body, and everything it runs ────────────────
  const findings = [];
  for (const [file, raw] of sources) {
    const text = raw.replace(/\r\n/g, '\n');
    const sql = blankLiterals(text);

    // The containers a self-check can be written in: a top-level DO block, and
    // (family D) any function the file installs and then calls.
    const units = [];
    // The RAW slice, not the lexed one: executePayloads() must read the string
    // literal `execute` runs, and blankLiterals() has already blanked exactly
    // that text in `sql`. Both lexers preserve length, so the offsets agree.
    const rawAt = (at, len) => text.slice(at, at + len);
    for (const { at, raw: lexedBody } of doBlocks(sql)) {
      units.push({
        at,
        body: blankNested(lexedBody),
        locals: localsOf(lexedBody),
        rawBody: rawAt(at, lexedBody.length),
      });
    }
    for (const fn of installedAndCalled(sql, globalFns)) {
      units.push({
        at: fn.at,
        body: blankNested(fn.body),
        locals: fn.given,
        rawBody: rawAt(fn.at, fn.body.length),
      });
    }

    const dmlIn = (code, locals, at, via) => {
      for (const d of code.matchAll(DML)) {
        const table = d[2].toLowerCase();
        if (!playerTables.has(table)) continue;
        const semi = code.indexOf(';', d.index);
        const stmt = code.slice(d.index, semi < 0 ? code.length : semi);
        if (isScoped(stmt, locals)) continue;
        findings.push({
          file,
          kind: 'dml',
          subject: `${d[1].split(/\s+/)[0].toLowerCase()} ${table}`,
          line: lineOf(text, at),
          detail: (via ? `${via}: ` : '') + stmt.replace(/\s+/g, ' ').trim().slice(0, 140),
        });
      }
    };

    for (const u of units) {
      dmlIn(u.body, u.locals, u.at, '');
      // Correct the line for the direct statements: they carry their own offset.
      for (const d of u.body.matchAll(DML)) {
        const table = d[2].toLowerCase();
        if (!playerTables.has(table)) continue;
        const semi = u.body.indexOf(';', d.index);
        const stmt = u.body.slice(d.index, semi < 0 ? u.body.length : semi);
        if (isScoped(stmt, u.locals)) continue;
        const f = findings.find((x) => x.file === file && x.kind === 'dml'
          && x.detail === stmt.replace(/\s+/g, ' ').trim().slice(0, 140) && x.line === lineOf(text, u.at));
        if (f) f.line = lineOf(text, u.at + d.index);
      }
      // (family A) what the block hands to `execute`.
      for (const ex of executePayloads(u.rawBody)) {
        if (ex.code === null) {
          findings.push({
            file,
            kind: 'execute',
            subject: 'unreadable dynamic sql',
            line: lineOf(text, u.at + ex.at),
            detail: 'execute of a statement this guard cannot read — the one verb whose literal IS code',
          });
          continue;
        }
        dmlIn(blankNested(blankLiterals(ex.code)), u.locals, u.at + ex.at, 'execute');
        for (const [fn, info] of globalFns) {
          for (const c of ex.code.matchAll(new RegExp(`(?:public\\.)?\\b${fn}\\s*\\(`, 'gi'))) {
            if (callIsScoped(ex.code, ex.code.indexOf('(', c.index + c[0].length - 1), info, u.locals)) continue;
            findings.push({
              file, kind: 'call', subject: fn, line: lineOf(text, u.at + ex.at),
              detail: `execute: calls ${fn}(), whose body in ${info.file} is: ${info.stmt}`,
            });
          }
        }
      }
      // the calls the block makes to a function that is global by construction.
      for (const [fn, info] of globalFns) {
        for (const c of u.body.matchAll(new RegExp(`(?:public\\.)?\\b${fn}\\s*\\(`, 'gi'))) {
          if (callIsScoped(u.body, c.index + c[0].length - 1, info, u.locals)) continue;
          findings.push({
            file,
            kind: 'call',
            subject: fn,
            line: lineOf(text, u.at + c.index),
            detail: `calls ${fn}(), whose body in ${info.file} is: ${info.stmt}`,
          });
        }
      }
    }

    // A call at FILE top level — outside every container — runs just the same.
    const covered = units.map((u) => [u.at, u.at + u.rawBody.length]);
    for (const [fn, info] of globalFns) {
      const re = new RegExp(`\\b(?:select|perform|call)\\s+(?:public\\.|pg_temp\\.)?${fn}\\s*\\(`, 'gi');
      for (const c of sql.matchAll(re)) {
        if (covered.some(([a, b]) => c.index >= a && c.index < b)) continue;
        if (callIsScoped(sql, c.index + c[0].length - 1, info, new Set())) continue;
        findings.push({
          file, kind: 'call', subject: fn, line: lineOf(text, c.index),
          detail: `calls ${fn}() at file top level, whose body in ${info.file} is: ${info.stmt}`,
        });
      }
    }
  }
  findings.sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line) || a.line - b.line);
  return { findings, globalFns };
}

// ── THE ACKNOWLEDGEMENTS ───────────────────────────────────────────────────
// key: `<file> :: <kind> :: <subject>`. Every entry must match at least one
// finding (an entry that matches nothing is RED — the list may not rot), and a
// `proof` entry's strings must all still be present in the file.
export const ACKNOWLEDGED = {
  '2026-08-29-auto-eat-tiers.sql :: dml :: update player_state': {
    verdict: 'applied-backfill',
    why: 'Section 3 is the file\'s WORK, not a self-check: the one-time, idempotent pass that '
       + 'brings any pre-existing auto_eat_pct inside its new tier ceiling (0 rows on production '
       + '2026-08-23). A backfill is global by definition. APPLIED — not edited.',
  },
  '2026-09-06-bank-cap-tracks-rungs.sql :: dml :: update player_state': {
    verdict: 'applied-backfill',
    why: 'Section 4, the one-time raise-only backfill that lifts every character already holding '
       + 'bank rungs from the base cap to their rung-derived one. Raise-only (`<` predicate), so a '
       + 're-run is a no-op and no player value moves down. APPLIED — not edited.',
  },
  '2026-09-06-recovering-until.sql :: dml :: update player_state': {
    verdict: 'applied-backfill',
    why: 'The one-time stamp of auto_eat_set_at on rows that ALREADY have auto-eat enabled, so the '
       + 'one-time offer is not made to players who plainly decided already. Writes a column that '
       + 'prices nothing. APPLIED — not edited.',
  },
  '2026-09-02-renown-kill-faucet.sql :: call :: hr_progress_prune': {
    verdict: 'applied-do-not-edit',
    why: 'GATE(c6) ages the probe rows past hr_progress_prune\'s 7-day floor and then calls it '
       + 'with p_older = 0, so the sweep reaches every character\'s PERIODIC player_progress rows '
       + '(period_key <> \'\') older than a week, not only the probe\'s. §3 is rolled back by its '
       + 'HR822 sentinel, so nothing commits, but that is the same "rolled back or not" line the '
       + '2026-09-20 incident was about. APPLIED — measured via the chain: 2026-09-06-cadence-'
       + 'recovery-floor.sql is evidenced-live on hr_credit_kills__ungated by hash, and that body '
       + 'is this file\'s §1 patch on top of 2026-09-01-kill-daily-credit.sql (the cadence file '
       + 'names exactly that provenance at its line 388). An applied migration is history and is '
       + 'not edited; if it is ever RE-APPLIED the call must be narrowed first — the probe rows '
       + 'are already aged and scoped, so a scoped delete would serve GATE(c6) unchanged.',
  },
  '2026-09-19-lifetime-facts-off-the-ledger.sql :: call :: hr_backfill_lifetime_facts': {
    verdict: 'scoped-by-proof',
    sites: 2,
    why: 'TWO unscoped calls remain, and both were read (Security review 2026-09-20, S-LF-1). '
       + 'Section 2 is the file\'s WORK - the one-time backfill itself, global by definition like '
       + 'the three acknowledged backfills above, and the only call that commits. GATE(c2) is the '
       + 'other: it proves the UNSCOPED re-run an operator would make REFUSES once hr_apply has '
       + 'allocated a live find, and step (0) raises before step (1) runs, so that call reaches no '
       + 'row at all. Every call inside the behavioural gates now passes p_user = v_uid, and '
       + 'GATE(a6) MEASURES the reach from the function\'s own reported row counts against a second '
       + 'probe character that also has a turn-in - so removing the scope is red on the replay, not '
       + 'only on a production journal. `sites` is pinned at 2: a third unscoped call is not '
       + 'covered by this argument and is reported.',
    proof: [
      'create or replace function public.hr_backfill_lifetime_facts(p_user uuid default null)',
      'v_bf := public.hr_backfill_lifetime_facts(v_uid);',
      'GATE(a6): the scoped backfill wrote % turn-in counter row(s)',
    ],
  },
  '2026-09-18-ledger-rollup-currencies.sql :: call :: hr_ledger_prune': {
    verdict: 'scoped-by-proof',
    why: 'The function under test IS the global retention prune, so the gates cannot avoid calling '
       + 'it. Instead §3(b0) widens hr_ledger_config.retain_days to its 3650-day ceiling and dates '
       + 'the probe rows beyond it, (e0) REFUSES the apply if any real row predates that widened '
       + 'window, and (e10b) re-reads the bystander count at the configured cut afterwards. The '
       + 'prune therefore runs unmodified with a reach that is provably the probe rows alone.',
    proof: [
      'update public.hr_ledger_config set retain_days = 3650 where only_row;',
      'e0: % real ledger row(s) predate the widened retention window',
      'e10b: the prune deleted % ledger row(s) belonging to REAL ',
    ],
  },
};

const keyOf = (f) => `${f.file} :: ${f.kind} :: ${f.subject}`;

async function sources() {
  const files = (await readdir(MIGDIR)).filter((f) => f.endsWith('.sql')).sort();
  const map = new Map();
  for (const f of files) map.set(f, await readFile(join(MIGDIR, f), 'utf8'));
  return map;
}

async function playerTables() {
  let census;
  try { census = JSON.parse(await readFile(CENSUS, 'utf8')); }
  catch (err) {
    const e = new Error(`tests/restore-census.baseline.json is unreadable (${err.message}).\n`
      + '  It is the manifest of player-value tables this guard reads. Without it there is\n'
      + '  nothing to assert against and a "pass" would be meaningless.');
    e.harness = true; throw e;
  }
  const list = census.player_value_tables;
  if (!Array.isArray(list) || list.length < 10) {
    const e = new Error('tests/restore-census.baseline.json carries no usable player_value_tables list');
    e.harness = true; throw e;
  }
  return new Set(list.map((t) => t.toLowerCase()));
}

/** Classify findings against the acknowledgements. Pure. */
export function verdicts(findings, srcs, acks = ACKNOWLEDGED) {
  const open = [];
  const listed = [];
  const stale = [];
  const used = new Set();
  // An entry may pin HOW MANY statements it waives. A waiver is an argument
  // about code somebody read; it may not silently spread to a call site that
  // was written afterwards, which is exactly how the next blanket prune would
  // arrive inside an already-waived file. Count first, then classify.
  const seen = new Map();
  for (const f of findings) seen.set(keyOf(f), (seen.get(keyOf(f)) || 0) + 1);

  for (const f of findings) {
    const k = keyOf(f);
    const a = acks[k];
    if (!a) { open.push(f); continue; }
    used.add(k);
    if (typeof a.sites === 'number' && seen.get(k) !== a.sites) {
      open.push({ ...f, countDrift: `${seen.get(k)} statement(s) now match an acknowledgement written for ${a.sites}` });
      continue;
    }
    const missing = (a.proof || []).filter((p) => !(srcs.get(f.file) || '').includes(p));
    if (missing.length) stale.push({ ...f, missing });
    else listed.push({ ...f, verdict: a.verdict, why: a.why });
  }
  const unused = Object.keys(acks).filter((k) => !used.has(k));
  return { open, listed, stale, unused };
}

// ── --selftest ─────────────────────────────────────────────────────────────
// Real defects planted in the real migration text, in memory. Each names the
// assertion that must catch it; the two controls must stay silent.
const TARGET = '2026-09-19-lifetime-facts-off-the-ledger.sql';
const IN_BLOCK = `    v_bf := public.hr_backfill_lifetime_facts(v_uid);`;

const PLANTS = [
  {
    name: 'blanket_prune',
    what: 'the 2026-09-19 statement itself — a self-check deleting every player\'s aged ledger rows',
    by: 'open', match: /delete player_ledger/,
    patch: (s) => s.replace(IN_BLOCK,
      `    delete from public.player_ledger where at < now() - interval '1 day';\n${IN_BLOCK}`),
  },
  {
    name: 'global_update',
    what: 'a self-check zeroing an inventory column across every character',
    by: 'open', match: /update player_inventory/,
    patch: (s) => s.replace(IN_BLOCK, `    update public.player_inventory set qty = 0;\n${IN_BLOCK}`),
  },
  {
    name: 'truncate_a_journal',
    what: 'a self-check emptying the money journal outright',
    by: 'open', match: /truncate player_ledger/,
    patch: (s) => s.replace(IN_BLOCK, `    truncate table public.player_ledger;\n${IN_BLOCK}`),
  },
  {
    name: 'global_prune_call',
    what: 'a self-check calling the retention prune, which is global by construction, with nothing narrowing its reach',
    by: 'open', match: /hr_ledger_prune/,
    patch: (s) => s.replace(IN_BLOCK, `    perform public.hr_ledger_prune(20000);\n${IN_BLOCK}`),
  },
  {
    name: 'scope_narrowing_deleted',
    what: 'the acknowledged file keeps calling the global prune but the scope narrowing it was acknowledged FOR is gone',
    file: '2026-09-18-ledger-rollup-currencies.sql',
    by: 'stale', match: /hr_ledger_prune/,
    patch: (s) => s.replace('    update public.hr_ledger_config set retain_days = 3650 where only_row;',
      '    -- narrowing removed'),
  },
  {
    name: 'acknowledgement_outlives_its_code',
    what: 'an acknowledged backfill is scoped by a later edit and the entry is left behind describing nothing',
    file: '2026-09-06-recovering-until.sql',
    by: 'unused', match: /recovering-until/,
    // Scope the backfill. The finding disappears, and the entry describing it
    // must then be reported as waiving nothing.
    patch: (s) => s.replace(
      /(update public\.player_state\n(?:.*\n)*?\s*where\s+auto_eat_enabled)/,
      '$1 and user_id = v_n::text::uuid'),
  },
  // ── S-SC-1: one plant per bypass FAMILY (security review 2026-09-20). Each
  //    is a real, writable migration statement that reached every player's rows
  //    and that this guard reported as clean before the families were closed.
  //    tests/selfcheck-no-global-dml.bypass.mjs is the same ten shapes end to
  //    end; these are here so the guard fails on its own terms if one reopens.
  {
    name: 'A execute_string_literal',
    what: 'family A — the 2026-09-20 statement handed to EXECUTE as a string literal, which blankLiterals() used to blank',
    by: 'open', match: /delete player_ledger/,
    patch: (s) => s.replace(IN_BLOCK,
      `    execute 'delete from public.player_ledger where at < now() - interval ''1 day''';\n${IN_BLOCK}`),
  },
  {
    name: 'A execute_format',
    what: 'family A — the same delete assembled by format(), where the table name is never a token',
    by: 'open', match: /delete player_ledger/,
    patch: (s) => s.replace(IN_BLOCK,
      `    execute format('delete from %I where at < now()', 'player_ledger');\n${IN_BLOCK}`),
  },
  {
    name: 'A execute_dollar_quoted',
    what: 'family A — the same delete in a nested dollar-quote, which blankNested() used to blank wholesale',
    by: 'open', match: /delete player_ledger/,
    patch: (s) => s.replace(IN_BLOCK,
      `    execute $q$ delete from public.player_ledger where at < now() $q$;\n${IN_BLOCK}`),
  },
  {
    name: 'B fake_bind_is_not_null',
    what: 'family B — `where id is not null and at < v_cut`: a blanket prune that used to read as owner-scoped',
    by: 'open', match: /delete player_ledger/,
    patch: (s) => s.replace(IN_BLOCK,
      `    delete from public.player_ledger where id is not null and at < v_cut;\n${IN_BLOCK}`),
  },
  {
    name: 'B fake_bind_subselect',
    what: 'family B — the owner column bound to a subselect over the whole table',
    by: 'open', match: /delete player_ledger/,
    patch: (s) => s.replace(IN_BLOCK,
      `    delete from public.player_ledger where id in (select id from public.player_ledger where at < v_cut);\n${IN_BLOCK}`),
  },
  {
    name: 'B cte_delete_time_only',
    what: 'family B — hr_ledger_prune\'s own CTE shape inlined: every player\'s aged rows, batched',
    by: 'open', match: /delete player_ledger/,
    patch: (s) => s.replace(IN_BLOCK,
      `    with doomed as (select id, at from public.player_ledger where at < v_cut order by at, id limit 20000)\n`
      + `     delete from public.player_ledger l using doomed d where l.id = d.id and l.at < v_cut;\n${IN_BLOCK}`),
  },
  {
    name: 'B update_from_join',
    what: 'family B — UPDATE … FROM across every character; the join column supplied the fake bind',
    by: 'open', match: /update player_state/,
    patch: (s) => s.replace(IN_BLOCK,
      `    update public.player_state s set gold = 0 from public.player_progress p\n`
      + `      where s.user_id = p.user_id and s.slot = v_slot;\n${IN_BLOCK}`),
  },
  {
    name: 'C unscoped_backfill_call',
    what: 'family C — a THIRD unscoped call to the globally-upserting backfill; the acknowledgement is pinned at the two that were read',
    by: 'open', match: /hr_backfill_lifetime_facts/,
    patch: (s) => s.replace(IN_BLOCK, `    v_bf := public.hr_backfill_lifetime_facts();\n${IN_BLOCK}`),
  },
  {
    name: 'C call_global_update_fn',
    what: 'family C — a chain function whose body globally UPDATEs a player table, called from a gate',
    by: 'open', match: /hr_probe_zero_gold/,
    patch: (s) => `${s.replace(IN_BLOCK, `    perform public.hr_probe_zero_gold();\n${IN_BLOCK}`)}\n`
      + 'create or replace function public.hr_probe_zero_gold()\n'
      + 'returns void language sql as $fn$\n  update public.player_state set gold = 0;\n$fn$;\n',
  },
  {
    name: 'D selfcheck_in_temp_fn',
    what: 'family D — the same blanket prune in a pg_temp function the file then SELECTs, i.e. not a DO block at all',
    by: 'open', match: /sec_probe_selfcheck/,
    patch: (s) => `${s}\ncreate function pg_temp.sec_probe_selfcheck() returns void language plpgsql as $sc$\n`
      + "declare v_cut timestamptz := now() - interval '90 days';\n"
      + 'begin\n  delete from public.player_ledger where at < v_cut;\nend $sc$;\n'
      + 'select pg_temp.sec_probe_selfcheck();\n',
  },
  // ── NEGATIVE CONTROLS ──
  {
    name: 'CONTROL scoped_delete',
    what: 'a delete that names the probe character — the correct shape must not be reported',
    control: true,
    patch: (s) => s.replace(IN_BLOCK,
      `    delete from public.player_ledger where user_id = v_uid and at < v_cut;\n${IN_BLOCK}`),
  },
  {
    name: 'CONTROL comment_only',
    what: 'a comment that contains the words of a blanket delete — prose is not code',
    control: true,
    patch: (s) => s.replace(IN_BLOCK,
      `    -- delete from public.player_ledger where at < now() - interval '1 day';\n${IN_BLOCK}`),
  },
  {
    name: 'CONTROL catalogue_delete',
    what: 'a global delete on a CATALOGUE table — this guard is about player value, and a catalogue reseed is normal',
    control: true,
    patch: (s) => s.replace(IN_BLOCK, `    delete from public.hr_unlock_offers;\n${IN_BLOCK}`),
  },
  {
    name: 'CONTROL scoped_backfill_call',
    what: 'a further call that PASSES the owner scope — a scoped call is not a global one, and must not be counted as a third site',
    control: true,
    patch: (s) => s.replace(IN_BLOCK, `    v_bf := public.hr_backfill_lifetime_facts(v_uid);\n${IN_BLOCK}`),
  },
  {
    name: 'CONTROL format_keeps_the_bind',
    what: 'an EXECUTE whose format() argument is the probe itself — reading the literal as code must not lose the binding it carries',
    control: true,
    patch: (s) => s.replace(IN_BLOCK,
      `    execute format('update public.player_state set gold = 0 where user_id = %L', v_uid);\n${IN_BLOCK}`),
  },
];

async function selftest() {
  const base = await sources();
  const tables = await playerTables();
  let failed = 0;
  for (const p of PLANTS) {
    const file = p.file || TARGET;
    const before = base.get(file);
    if (before === undefined) {
      console.error(`HARNESS  ${p.name}: ${file} is not in supabase/migrations/`);
      process.exit(2);
    }
    const after = p.patch(before);
    if (after === before) {
      console.error(`HARNESS  ${p.name}: the plant changed nothing — the anchor has moved.\n`
        + '           A defect that was never planted is the same defect as a probe that is always null.');
      process.exit(2);
    }
    const srcs = new Map(base); srcs.set(file, after);
    const { findings } = scan(srcs, tables);
    const v = verdicts(findings, srcs);
    if (p.control) {
      const noise = [...v.open, ...v.stale].filter((f) => f.file === file);
      if (noise.length) {
        console.error(`FALSE POSITIVE  ${p.name}\n           ${p.what}\n`
          + noise.map((f) => `           ${f.file}:${f.line}  ${f.subject}`).join('\n'));
        failed++;
      } else {
        console.log(`silent   ${p.name.padEnd(28)} ${p.what}`);
      }
      continue;
    }
    const bucket = p.by === 'unused' ? v.unused.map((k) => ({ file: k, subject: k, line: 0 })) : v[p.by];
    const hit = bucket.filter((f) => p.match.test(`${f.file} ${f.subject}`));
    if (!hit.length) {
      console.error(`SLIPPED  ${p.name}\n           ${p.what}\n`
        + `           Not reported as "${p.by}". This guard does not see it; it is decoration until it does.`);
      failed++;
    } else {
      console.log(`caught   ${p.name.padEnd(28)} via ${p.by.padEnd(6)} ${p.what}`);
    }
  }
  if (failed) {
    console.error(`\n${failed} of ${PLANTS.length} probes failed.`);
    process.exit(1);
  }
  console.log(`\nall ${PLANTS.filter((p) => !p.control).length} planted defects caught, `
    + `${PLANTS.filter((p) => p.control).length} controls silent`);
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  if (argv.includes('--selftest')) { await selftest(); return; }

  const srcs = await sources();
  const tables = await playerTables();
  const { findings, globalFns } = scan(srcs, tables);
  const { open, listed, stale, unused } = verdicts(findings, srcs);

  if (argv.includes('--list')) {
    console.log(`player-value tables (tests/restore-census.baseline.json): ${tables.size}`);
    console.log(`global-DML functions derived from the chain: ${[...globalFns.keys()].sort().join(', ')}`);
    console.log(`\nmigrations scanned: ${srcs.size}   findings: ${findings.length}\n`);
    for (const [tag, list] of [['OPEN     ', open], ['STALE-ACK', stale], ['listed   ', listed]]) {
      for (const f of list) {
        console.log(`${tag} ${f.file}:${f.line}  [${f.kind}] ${f.subject}`);
        console.log(`          ${f.detail}`);
        if (f.why) console.log(`          ack: ${f.why.split('. ')[0]}.`);
      }
    }
    for (const k of unused) console.log(`UNUSED-ACK ${k}`);
  }

  let bad = 0;
  for (const f of open) {
    bad++;
    console.error(`GLOBAL DML IN A SELF-CHECK  ${f.file}:${f.line}`);
    console.error(`  [${f.kind}] ${f.subject}`);
    console.error(`  ${f.detail}`);
    if (f.countDrift) {
      console.error(`  ${f.countDrift}. The waiver covers the statements the security review\n`
        + '  actually read, and no others. Re-argue it and re-pin `sites`, or scope the\n'
        + '  new statement.');
    } else {
      console.error('  This statement can reach a row the block did not create. Scope it to the\n'
        + '  probe character (user_id = v_uid, or the id of a row this block inserted), or\n'
        + '  — if it is a one-time backfill rather than a self-check — acknowledge it in\n'
        + '  tests/selfcheck-no-global-dml.mjs with the reason written down.');
    }
  }
  for (const f of stale) {
    bad++;
    console.error(`STALE ACKNOWLEDGEMENT  ${f.file}:${f.line}  [${f.kind}] ${f.subject}`);
    console.error(`  The acknowledgement rests on evidence this file no longer carries:\n`
      + f.missing.map((m) => `    missing: ${m}`).join('\n'));
    console.error('  Either restore the narrowing or re-argue the acknowledgement.');
  }
  for (const k of unused) {
    bad++;
    console.error(`UNUSED ACKNOWLEDGEMENT  ${k}`);
    console.error('  Nothing in the chain matches it any more. Delete the entry — a list of\n'
      + '  waivers for code nobody kept is how the next real one gets waved through.');
  }
  if (bad) {
    console.error(`\n${bad} finding(s). See the header for the 2026-09-20 incident this exists for.`);
    process.exit(1);
  }
  console.log(`selfcheck-no-global-dml: OK — ${srcs.size} migrations, ${findings.length} global statement(s), `
    + `all ${listed.length} acknowledged with a written reason`);
}

// S-SC-2 (security review 2026-09-20): this used to be a bare `main()` at module
// scope, so importing the module to reach its exported scan()/verdicts() ran the
// whole guard — and killed the importer with process.exit(1) whenever the repo
// was red. tests/selfcheck-no-global-dml.bypass.mjs imports both. Run only when
// this file IS the entry point.
const IS_ENTRY = process.argv[1]
  && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url));
if (IS_ENTRY) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(e.harness ? 2 : 1);
  });
}
