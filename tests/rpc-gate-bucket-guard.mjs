#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/rpc-gate-bucket-guard.mjs — the gate-bucket drift guard.
//
// THE CLASS THIS KILLS (live incident, b484–b487, found 2026-08-29):
// hr_rpc_gate's case list was maintained two incompatible ways — some
// migrations SPLICED their bucket into the live definition, others FULLY
// REPLACED the function from a template. 2026-08-30-bounty-kill-credit
// replaced it from a STALE template and silently dropped five spliced
// buckets (hr_trait_buy, hr_set_style, hr_claim_goal, hr_goal_state,
// client_state_put). An unlisted bucket hits `else return false` = refused
// 100% of the time as "rate_limited", with zero telemetry — live players
// could not buy Auto-Eat, keep a combat style, claim quests, or save
// residue state, and nothing in monitoring said why.
//
// THE RULE (stated in 2026-08-29-rpc-gate-bucket-restore.sql): the LIVE gate
// must admit EVERY bucket that ANY migration passes to hr_rpc_gate('…'). A
// bucket may reach the live gate two legitimate ways:
//   (A) it is named in the LAST full `create or replace function
//       public.hr_rpc_gate` definition's case list; OR
//   (B) it is added by a SPLICE that runs AFTER that last full def — the
//       pg_get_functiondef + guarded `replace` + `execute` idiom (§6 of
//       2026-09-08-hero-slot-buy.sql, first used in 2026-08-28-client-state),
//       which patches the live body without restating it.
// A full def CLOBBERS every splice applied before it (that clobber IS the
// b484–b487 incident), so a bucket spliced BEFORE the last full def only
// survives if the full def also lists it.
//
// Mechanics: walk tests/schema-apply-order.json (pre_schema + order — the
// canonical chain, itself guarded in sync with the migrations dir) and REPLAY
// it in apply order, modelling the live admitted-bucket set exactly as the DB
// would end up:
//   • a full def RESETS the set to its own `case p_bucket … end case` list;
//   • a splice (a `do $$…$$` block that both reads hr_rpc_gate via
//     pg_get_functiondef AND `execute`s a body carrying new `when ''<bucket>''`
//     clauses) ADDS those buckets to the set;
//   • a pg_get_functiondef used only in a self-check (a `position(… in v_def)`
//     assertion with no `execute`, as in the restore + kill-daily migrations)
//     is NOT a splice and adds nothing.
// Then assert every caller bucket (plain 'x' or dynamic-SQL ''x'') is in the
// final live set.
//
//   node tests/rpc-gate-bucket-guard.mjs --selftest   (the retirement rule cannot hide a live caller)
// Exit: 0 green · 1 drift · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIGDIR = join(ROOT, 'supabase', 'migrations');

/** @param {{ edit?: (file:string, sql:string) => string }} [opts] edit: the
 *  --selftest's in-memory mutation of one file's text (never written to disk). */
export async function rpcGateBucketGuard({ edit = null } = {}) {
  const manifest = JSON.parse(
    await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8'));
  const order = [...(manifest.pre_schema || []), ...manifest.order];

  // Buckets whose refusal is INTENDED. A name added here needs a comment
  // saying why. These three are self-check probes inside the lockdown/rate-gate
  // migrations that deliberately assert the else branch REFUSES an unknown
  // bucket — the fail-closed property itself.
  const DEAD_CALLERS = new Set(['__not_a_bucket__', 'not_a_bucket', 'f']);

  // Events that mutate the gate's admitted-bucket set, tagged with a global
  // apply-order key [fileIndex, offsetInFile] so a file carrying BOTH a full
  // def and a splice (or a splice + a later full def anywhere in the chain) is
  // ordered correctly.
  const events = [];             // { key:[fi,pos], type:'fulldef'|'splice', buckets:[], file }
  const callers = new Map();     // bucket -> [files that pass it]
  // RETIRED CALLERS (2026-10-30-reopen-rpc-sweep.sql dropped ten claim RPCs and
  // their buckets). A bucket is owed admission only while a SURVIVING function
  // passes it. Each call is attributed to the nearest preceding `create function
  // public.<fn>` header in its file; it is dead only when a `drop function
  // public.<fn>(` lands LATER in apply order than that function's last
  // (re)creation. Re-create the function after its drop and its bucket is owed
  // again (--selftest proves both directions).
  const rawCalls = [];           // { bucket, file, key:[fi,pos], fn }
  const lastCreate = new Map();  // fn -> [fi,pos]
  const lastDrop = new Map();    // fn -> [fi,pos]

  for (let fi = 0; fi < order.length; fi++) {
    const f = order[fi];
    let sql;
    try { sql = (await readFile(join(MIGDIR, f), 'utf8')).replace(/\r\n/g, '\n'); }
    catch { continue; }          // manifest↔disk sync is schema-replay's job
    if (edit) sql = edit(f, sql);

    const headers = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi)]
      .map((m) => ({ fn: m[1].toLowerCase(), pos: m.index }));
    for (const h of headers) lastCreate.set(h.fn, [fi, h.pos]);
    // A drop counts only as a STATEMENT at the start of a line: a commented-out
    // `--   drop function …` (a reversibility note) or one buried in a string
    // retires nothing, so the bucket stays owed (fail-safe).
    for (const m of sql.matchAll(/^[ \t]*drop\s+function\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)\s*\(/gim)) {
      lastDrop.set(m[1].toLowerCase(), [fi, m.index]);
    }

    // ── Full definitions ──────────────────────────────────────────────────
    // Admission is judged against the CASE LIST ONLY (`case p_bucket` …
    // `end case`), never the whole file — a bucket named in a comment or a
    // self-check do-block must NOT count as admitted (the first draft of this
    // guard made that mistake and its own negative proof caught it).
    /* CASE-INSENSITIVE: a body restated from pg_get_functiondef reads
       `CREATE OR REPLACE FUNCTION` (2026-10-21-hunt-sessions.sql §6), and a
       lowercase-only search read that restatement as no definition at all —
       reporting its own three buckets as unadmitted. */
    const lower = sql.toLowerCase();
    for (let at = lower.indexOf('create or replace function public.hr_rpc_gate');
         at !== -1;
         at = lower.indexOf('create or replace function public.hr_rpc_gate', at + 1)) {
      const body = sql.slice(at);
      const caseAt = body.indexOf('case p_bucket');
      const caseEnd = body.indexOf('end case', caseAt);
      if (caseAt === -1 || caseEnd === -1) {
        const e = new Error(`${f}: full hr_rpc_gate definition has no parseable \`case p_bucket … end case\` block`);
        e.harness = true; throw e;
      }
      const caseList = body.slice(caseAt, caseEnd);
      const buckets = [...caseList.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
      events.push({ key: [fi, at], type: 'fulldef', buckets, file: f });
    }

    // ── Splices (additive patches that EXECUTE a modified gate body) ────────
    // A real splice is a `do $tag$…$tag$` block that (1) reads the live gate via
    // pg_get_functiondef, (2) `execute`s a rebuilt body, and (3) injects at
    // least one `when ''<bucket>'' then` clause. A block that reads the gate for
    // a `position(… in v_def)` self-check but never `execute`s it (restore's and
    // kill-daily's precondition probes) is NOT a splice and admits nothing.
    for (const blk of sql.matchAll(/\bdo\s*(\$[a-z0-9_]*\$)([\s\S]*?)\1/g)) {
      const region = blk[2];
      if (!region.includes("pg_get_functiondef('public.hr_rpc_gate")) continue;
      if (!/\bexecute\b/.test(region)) continue;   // read-only self-check, not a splice
      const buckets = [...region.matchAll(/when\s+''([a-z0-9_]+)''\s+then/g)].map((m) => m[1]);
      if (!buckets.length) continue;               // an execute with no new when-clause adds nothing
      events.push({ key: [fi, blk.index], type: 'splice', buckets, file: f });
    }

    // Collect caller buckets: hr_rpc_gate('x') in plain SQL, hr_rpc_gate(''x'')
    // inside dynamic-SQL strings. Exclude the def itself (p_bucket parameter).
    // Two kinds of mention are NOT a live caller and are skipped (2026-10-30,
    // when the gate first shrank to exactly its live callers): a call inside a
    // `-- comment`, and a SINGLE-quoted call inside a `do $tag$ … $tag$` block —
    // an apply-time probe that ran once (the A9 lockdown's clan_deposit /
    // clan_seat_read refusal test). A DOUBLE-quoted call in a do block is dynamic
    // SQL that may install a body, so it stays owed (fail-safe).
    const code = sql.replace(/--[^\n]*/g, (c) => ' '.repeat(c.length));
    const doBlocks = [...code.matchAll(/\bdo\s*(\$[a-z0-9_]*\$)([\s\S]*?)\1/g)]
      .map((d) => [d.index, d.index + d[0].length]);
    for (const m of code.matchAll(/hr_rpc_gate\s*\(\s*('{1,2})([a-z0-9_]+)'{1,2}\s*\)/g)) {
      if (m[1].length === 1 && doBlocks.some(([s0, e0]) => m.index > s0 && m.index < e0)) continue;
      const enclosing = headers.filter((h) => h.pos < m.index).pop();
      rawCalls.push({ bucket: m[2], file: f, key: [fi, m.index], fn: enclosing ? enclosing.fn : null });
    }
  }
  const cmpKey = (x, y) => (x[0] - y[0]) || (x[1] - y[1]);
  const retired = new Set();
  for (const c of rawCalls) {
    const dropped = c.fn && lastDrop.get(c.fn);
    if (dropped && cmpKey(dropped, lastCreate.get(c.fn)) > 0) { retired.add(`${c.bucket} (${c.fn})`); continue; }
    if (!callers.has(c.bucket)) callers.set(c.bucket, []);
    if (!callers.get(c.bucket).includes(c.file)) callers.get(c.bucket).push(c.file);
  }

  // Model the LIVE admitted set: the LAST full def is the baseline (it clobbers
  // every splice before it — that clobber IS the incident), then splices AFTER
  // it patch that baseline. splicedIn reports only buckets that reach the gate
  // NET-NEW via a surviving splice (not ones the last full def already lists).
  events.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1]);
  const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]);
  const fullDefs = events.filter((e) => e.type === 'fulldef');
  const lastFullDef = fullDefs[fullDefs.length - 1];

  if (!lastFullDef) {
    const e = new Error('no full `create or replace function public.hr_rpc_gate` found in the chain — the guard has nothing to check against');
    e.harness = true; throw e;
  }

  const admitted = new Set(lastFullDef.buckets);
  const splicedIn = [];
  for (const ev of events) {
    if (ev.type !== 'splice') continue;
    if (cmp(ev.key, lastFullDef.key) <= 0) continue;   // clobbered by the last full def
    for (const b of ev.buckets) {
      if (!admitted.has(b)) splicedIn.push(`'${b}' (${ev.file})`);
      admitted.add(b);
    }
  }

  const missing = [];
  for (const [bucket, files] of [...callers.entries()].sort()) {
    if (DEAD_CALLERS.has(bucket)) continue;
    if (!admitted.has(bucket)) {
      missing.push(`  '${bucket}' — passed by ${files.join(', ')}`);
    }
  }

  if (missing.length) {
    throw new Error(
      'RPC-GATE BUCKET DRIFT — the live hr_rpc_gate (last full def '
      + lastFullDef.file + ', plus any splice after it) does not admit every\n'
      + 'caller bucket. An unlisted bucket is refused 100% of the time as\n'
      + '"rate_limited" with no telemetry (the b484–b487 live incident: Auto-Eat\n'
      + 'unbuyable, styles reverting, quest claims dead, residue saves frozen).\n'
      + 'Either re-state the FULL bucket list in the latest gate definition\n'
      + '(never replace from an old template) or add the bucket via the splice\n'
      + 'idiom AFTER the last full def.\nMissing:\n' + missing.join('\n'));
  }

  return { buckets: callers.size, finalDef: lastFullDef.file, spliced: splicedIn, retired: [...retired].sort() };
}

/* --selftest: the retirement rule must not become a hiding place. Each mutation
   edits the chain IN MEMORY; every one must turn the guard red. */
const RETIRING = '2026-10-30-reopen-rpc-sweep.sql';
const CLEANUP = '2026-10-31-server-cleanup.sql';   // hr_rpc_gate's last full def
const SELFTEST = [
  { name: 'drop-line-removed',
    why: 'hr_claim_rank is no longer dropped, so its bucket is owed again and the gate refuses it',
    edit: (f, sql) => (f === RETIRING ? sql.replace('drop function if exists public.hr_claim_rank(text, integer);\n', '') : sql) },
  { name: 'dropped-fn-recreated-later',
    why: 'a LATER file re-creates hr_claim_rank passing its retired bucket: the drop is before the create',
    edit: (f, sql) => (f === RETIRING ? `${sql}\ncreate or replace function public.hr_claim_rank(p text, s int) returns boolean language sql as $f$ select public.hr_rpc_gate('hr_claim_rank') $f$;\n` : sql) },
  { name: 'live-caller-of-retired-bucket',
    why: 'a surviving function passes a retired bucket (hr_login_claim spending hr_claim_quest)',
    edit: (f, sql) => (f === '2026-10-23-premium-login-reward.sql' ? sql.replace("hr_rpc_gate('hr_claim_daily')", "hr_rpc_gate('hr_claim_quest')") : sql) },
  { name: 'kept-bucket-unlisted',
    why: 'the restated gate forgets hr_claim_daily, which hr_login_claim still spends',
    edit: (f, sql) => (f === CLEANUP ? sql.replace("         'hr_claim_daily'\n", '') : sql) },
  { name: 'live-caller-in-a-later-function',
    why: 'a later top-level function passes a dropped clan bucket: a real caller, not a do-block probe',
    edit: (f, sql) => (f === CLEANUP ? `${sql}\ncreate or replace function public.hr_mut_clan() returns boolean language sql as $f$ select public.hr_rpc_gate('clan_join') $f$;\n` : sql) },
];

async function selftest() {
  try { await rpcGateBucketGuard(); } catch (e) { console.error(`CLEAN arm is red: ${e.message}`); return 1; }
  console.log('CLEAN   the unmutated chain is green');
  let missed = 0;
  for (const m of SELFTEST) {
    let changed = false;
    const edit = (f, sql) => { const out = m.edit(f, sql); if (out !== sql) changed = true; return out; };
    try {
      await rpcGateBucketGuard({ edit });
      console.error(`MISSED  ${m.name}${changed ? '' : ' (the edit never landed — fix its anchor)'}\n          ${m.why}`);
      missed += 1;
    } catch (e) {
      if (e.harness || !changed) { console.error(`MISSED  ${m.name}: ${changed ? 'harness' : 'edit never landed'} — ${e.message}`); missed += 1; continue; }
      console.log(`CAUGHT  ${m.name}\n          ${m.why}`);
    }
  }
  if (missed) { console.error(`\n${missed} of ${SELFTEST.length} mutations NOT caught.`); return 1; }
  console.log(`\nall ${SELFTEST.length} mutations caught.`);
  return 0;
}

// Standalone: node tests/rpc-gate-bucket-guard.mjs
if (isMain(import.meta.url) && process.argv.includes('--selftest')) {
  selftest().then((code) => process.exit(code), (e) => { console.error(String(e.stack || e)); process.exit(2); });
} else if (isMain(import.meta.url)) {
  rpcGateBucketGuard().then(
    (r) => {
      const via = r.spliced.length ? ` (${r.spliced.length} added by splice: ${r.spliced.join(', ')})` : '';
      const gone = r.retired.length ? ` ${r.retired.length} caller(s) retired with their dropped function: ${r.retired.join(', ')}.` : '';
      console.log(`RPC-gate bucket guard — ${r.buckets} caller bucket(s) all admitted by ${r.finalDef}${via}.${gone}`);
    },
    (e) => { console.error(String(e.message || e)); process.exit(e.harness ? 2 : 1); });
}
