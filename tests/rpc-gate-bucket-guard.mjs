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
// Exit: 0 green · 1 drift · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIGDIR = join(ROOT, 'supabase', 'migrations');

export async function rpcGateBucketGuard() {
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

  for (let fi = 0; fi < order.length; fi++) {
    const f = order[fi];
    let sql;
    try { sql = (await readFile(join(MIGDIR, f), 'utf8')).replace(/\r\n/g, '\n'); }
    catch { continue; }          // manifest↔disk sync is schema-replay's job

    // ── Full definitions ──────────────────────────────────────────────────
    // Admission is judged against the CASE LIST ONLY (`case p_bucket` …
    // `end case`), never the whole file — a bucket named in a comment or a
    // self-check do-block must NOT count as admitted (the first draft of this
    // guard made that mistake and its own negative proof caught it).
    for (let at = sql.indexOf('create or replace function public.hr_rpc_gate');
         at !== -1;
         at = sql.indexOf('create or replace function public.hr_rpc_gate', at + 1)) {
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
    for (const m of sql.matchAll(/hr_rpc_gate\s*\(\s*'{1,2}([a-z0-9_]+)'{1,2}\s*\)/g)) {
      const bucket = m[1];
      if (!callers.has(bucket)) callers.set(bucket, []);
      if (!callers.get(bucket).includes(f)) callers.get(bucket).push(f);
    }
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

  return { buckets: callers.size, finalDef: lastFullDef.file, spliced: splicedIn };
}

// Standalone: node tests/rpc-gate-bucket-guard.mjs
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
    || process.argv[1]?.endsWith('rpc-gate-bucket-guard.mjs')) {
  rpcGateBucketGuard().then(
    (r) => {
      const via = r.spliced.length ? ` (${r.spliced.length} added by splice: ${r.spliced.join(', ')})` : '';
      console.log(`RPC-gate bucket guard — ${r.buckets} caller bucket(s) all admitted by ${r.finalDef}${via}.`);
    },
    (e) => { console.error(String(e.message || e)); process.exit(e.harness ? 2 : 1); });
}
