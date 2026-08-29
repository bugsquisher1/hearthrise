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
// THE RULE (stated in 2026-08-29-rpc-gate-bucket-restore.sql): the LAST
// full definition of hr_rpc_gate in apply order must admit EVERY bucket
// that ANY migration passes to hr_rpc_gate('…'). A migration adding a gate
// bucket must re-state the whole list; a migration replacing the gate for
// any other reason must copy the current definition, never a template.
//
// Mechanics: walk tests/schema-apply-order.json (pre_schema + order — the
// canonical chain, itself guarded in sync with the migrations dir), find the
// last file containing a full `create or replace function public.hr_rpc_gate`,
// collect every bucket any file passes to the gate (plain 'x' or dynamic-SQL
// ''x'' quoting), and assert each appears inside the final definition's body.
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

  let lastFullDef = null;        // { file, body } of the final full definition
  const callers = new Map();     // bucket -> [files that pass it]

  for (const f of order) {
    let sql;
    try { sql = (await readFile(join(MIGDIR, f), 'utf8')).replace(/\r\n/g, '\n'); }
    catch { continue; }          // manifest↔disk sync is schema-replay's job

    // The final full definition wins (splices before it are clobbered — that
    // is precisely the incident — so only the LAST full def counts).
    const defAt = sql.lastIndexOf('create or replace function public.hr_rpc_gate');
    if (defAt !== -1) {
      // Admission is judged against the CASE LIST ONLY (`case p_bucket` …
      // `end case`), never the whole file — a bucket named in a comment or a
      // self-check do-block must NOT count as admitted (the first draft of this
      // guard made that mistake and its own negative proof caught it).
      const body = sql.slice(defAt);
      const caseAt = body.indexOf('case p_bucket');
      const caseEnd = body.indexOf('end case', caseAt);
      if (caseAt === -1 || caseEnd === -1) {
        const e = new Error(`${f}: full hr_rpc_gate definition has no parseable \`case p_bucket … end case\` block`);
        e.harness = true; throw e;
      }
      lastFullDef = { file: f, body: body.slice(caseAt, caseEnd) };
    }

    // Collect caller buckets: hr_rpc_gate('x') in plain SQL, hr_rpc_gate(''x'')
    // inside dynamic-SQL strings. Exclude the def itself (p_bucket parameter).
    for (const m of sql.matchAll(/hr_rpc_gate\s*\(\s*'{1,2}([a-z0-9_]+)'{1,2}\s*\)/g)) {
      const bucket = m[1];
      if (!callers.has(bucket)) callers.set(bucket, []);
      if (!callers.get(bucket).includes(f)) callers.get(bucket).push(f);
    }
  }

  if (!lastFullDef) {
    const e = new Error('no full `create or replace function public.hr_rpc_gate` found in the chain — the guard has nothing to check against');
    e.harness = true; throw e;
  }

  const missing = [];
  for (const [bucket, files] of [...callers.entries()].sort()) {
    if (DEAD_CALLERS.has(bucket)) continue;
    // Admitted = the bucket name appears as a quoted literal in the final def's
    // case list. (`'x'` — the def never mentions caller buckets otherwise.)
    if (!lastFullDef.body.includes(`'${bucket}'`)) {
      missing.push(`  '${bucket}' — passed by ${files.join(', ')}`);
    }
  }

  if (missing.length) {
    throw new Error(
      'RPC-GATE BUCKET DRIFT — the last full hr_rpc_gate definition ('
      + lastFullDef.file + ') does not admit every caller bucket. An unlisted\n'
      + 'bucket is refused 100% of the time as "rate_limited" with no telemetry\n'
      + '(the b484–b487 live incident: Auto-Eat unbuyable, styles reverting,\n'
      + 'quest claims dead, residue saves frozen). Re-state the FULL bucket list\n'
      + 'in the latest gate definition — never replace from an old template.\n'
      + 'Missing:\n' + missing.join('\n'));
  }

  return { buckets: callers.size, finalDef: lastFullDef.file };
}

// Standalone: node tests/rpc-gate-bucket-guard.mjs
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
    || process.argv[1]?.endsWith('rpc-gate-bucket-guard.mjs')) {
  rpcGateBucketGuard().then(
    (r) => { console.log(`RPC-gate bucket guard — ${r.buckets} caller bucket(s) all admitted by ${r.finalDef}.`); },
    (e) => { console.error(String(e.message || e)); process.exit(e.harness ? 2 : 1); });
}
