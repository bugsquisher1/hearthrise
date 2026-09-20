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
// How far after an owner column a local variable may appear and still be read
// as binding it — enough for `in (v_uid, v_uid2)` and `= any(v_ids)`, not
// enough to reach into an unrelated later conjunct.
const BIND_WINDOW = 90;

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

/** Top-level `do $tag$ … $tag$` blocks, as {at, body} into the lexed text. */
function doBlocks(sql) {
  const res = [];
  const re = /(?:^|[\s;])do\s+(\$[A-Za-z_0-9]*\$)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const tag = m[1];
    const end = sql.indexOf(tag, m.index + m[0].length);
    if (end < 0) continue;
    const at = m.index + m[0].length;
    res.push({ at, body: blankNested(sql.slice(at, end)) });
    re.lastIndex = end;
  }
  return res;
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

/** Does this statement bind an owner column to a name the block declared? */
function isScoped(stmt, locals) {
  const w = stmt.split(/\bwhere\b/i);
  if (w.length < 2) return false;
  const pred = w.slice(1).join(' where ');
  for (const m of pred.matchAll(new RegExp(`\\b${OWNER}\\b`, 'gi'))) {
    const tail = pred.slice(m.index + m[0].length, m.index + m[0].length + BIND_WINDOW);
    for (const v of locals) {
      if (new RegExp(`\\b${v}\\b`, 'i').test(tail)) return true;
    }
  }
  return false;
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
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
      const dm = /\$[A-Za-z_0-9]*\$/.exec(sql.slice(m.index));
      if (!dm) continue;
      const bodyAt = m.index + dm.index + dm[0].length;
      const end = sql.indexOf(dm[0], bodyAt);
      if (end < 0) continue;
      const body = sql.slice(bodyAt, end);
      DML.lastIndex = 0;
      for (const d of body.matchAll(DML)) {
        const verb = d[1].split(/\s+/)[0].toLowerCase();
        if (verb === 'update') continue;              // a prune DELETES; an update is not this class
        if (!playerTables.has(d[2].toLowerCase())) continue;
        const semi = body.indexOf(';', d.index);
        const stmt = body.slice(d.index, semi < 0 ? body.length : semi);
        const w = stmt.split(/\bwhere\b/i);
        if (w.length > 1 && /\b(user_id|clan_id|owner_id)\b/i.test(w.slice(1).join(' '))) continue;
        if (!globalFns.has(m[1].toLowerCase())) {
          globalFns.set(m[1].toLowerCase(), { file, stmt: stmt.replace(/\s+/g, ' ').trim().slice(0, 120) });
        }
      }
    }
  }

  // ── Pass 2: the DO blocks ────────────────────────────────────────────────
  const findings = [];
  for (const [file, raw] of sources) {
    const text = raw.replace(/\r\n/g, '\n');
    const sql = blankLiterals(text);
    for (const { at, body } of doBlocks(sql)) {
      const locals = localsOf(body);
      for (const d of body.matchAll(DML)) {
        const table = d[2].toLowerCase();
        if (!playerTables.has(table)) continue;
        const semi = body.indexOf(';', d.index);
        const stmt = body.slice(d.index, semi < 0 ? body.length : semi);
        if (isScoped(stmt, locals)) continue;
        findings.push({
          file,
          kind: 'dml',
          subject: `${d[1].split(/\s+/)[0].toLowerCase()} ${table}`,
          line: lineOf(text, at + d.index),
          detail: stmt.replace(/\s+/g, ' ').trim().slice(0, 140),
        });
      }
      for (const [fn, info] of globalFns) {
        for (const c of body.matchAll(new RegExp(`(?:public\\.)?\\b${fn}\\s*\\(`, 'gi'))) {
          findings.push({
            file,
            kind: 'call',
            subject: fn,
            line: lineOf(text, at + c.index),
            detail: `calls ${fn}(), whose body in ${info.file} is: ${info.stmt}`,
          });
        }
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
  for (const f of findings) {
    const k = keyOf(f);
    const a = acks[k];
    if (!a) { open.push(f); continue; }
    used.add(k);
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
const IN_BLOCK = `    v_bf := public.hr_backfill_lifetime_facts();`;

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
    console.error('  This statement can reach a row the block did not create. Scope it to the\n'
      + '  probe character (user_id = v_uid, or the id of a row this block inserted), or\n'
      + '  — if it is a one-time backfill rather than a self-check — acknowledge it in\n'
      + '  tests/selfcheck-no-global-dml.mjs with the reason written down.');
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

main().catch((e) => {
  console.error(e.message || e);
  process.exit(e.harness ? 2 : 1);
});
