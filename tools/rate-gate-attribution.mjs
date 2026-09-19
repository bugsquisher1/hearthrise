// ============================================================================
// tools/rate-gate-attribution.mjs — is `hr_rate_gate` slow, or is the number
// an attribution artefact?  READ-ONLY.  Production is never written here.
//
//   node tools/rate-gate-attribution.mjs
//
// Same management endpoint and the same token discipline as tools/vitals.mjs
// (`~/.supabase-token`, read as file bytes, never printed, never in argv), and
// the same SELECT-only refusal so this tool can never become a writer.
//
// ── WHY THIS TOOL EXISTS ────────────────────────────────────────────────────
// On 2026-09-18 a reliability audit reported, from pg_stat_statements:
//
//     hr_rate_gate wraps the state projection at 271 ms MEAN / 6.8 s MAX,
//     while hr_state_of alone is 3.23 ms and hr_apply 9.35 ms.
//
// The reading was wrong, and the way it was wrong is a trap any future reader
// of pg_stat_statements on this database will fall into, so the refutation is
// a TOOL rather than a paragraph. Three facts, all re-measured by this script:
//
//  (1) `pg_stat_statements.track` is **top** on this instance (verified
//      2026-09-18). Nested statements inside a plpgsql/SQL function body are
//      therefore NOT counted separately. Every row you read is the cost of a
//      WHOLE top-level statement, including every function it calls.
//
//  (2) The Edge engine issues the gate in TWO different shapes, and only one of
//      them is the function on its own:
//
//        A. index.ts (the accrue verb):
//             select public.hr_rate_gate($1,$2,$3) as allowed
//           -> its OWN statement. This is hr_rate_gate, measured:
//              **141,422 calls, 0.20 ms mean, 29 s total** (2026-09-18).
//
//        B. spend.js / set-activity.js / claim-reward.js:
//             with g as (select public.hr_rate_gate($1,$2,$3) as allowed)
//             select g.allowed, case when g.allowed then public.hr_state_of(...) end, ...
//           -> the gate, the PROJECTION and (per file) hr_claim_lookup or
//              hr_offline_cap_ms are ONE statement. The row's query TEXT begins
//              with hr_rate_gate; its TIME is everything in the statement plus
//              anything that statement waited on. This is the row that was read
//              as "the gate", and it is not the gate.
//
//  (3) The control that settles it. Two shape-B statements exist with the
//      IDENTICAL gate call, and the SLOWER-LOOKING one does LESS work:
//
//        set-activity  gate + hr_state_of + hr_offline_cap_ms  2,626 calls
//                      mean  5.58 ms   max 162 ms   271 buffers/call
//        spend         gate + hr_state_of                      1,113 calls
//                      mean 271.39 ms  max 6.8 s    217 buffers/call
//
//      Same gate, same counter row, same lock. Strictly more work in the 5.58 ms
//      one. A slow hr_rate_gate would have to show up in BOTH, and in (2)(A)'s
//      141k-call sample. It shows up in none of them. The gate's contribution is
//      bounded above by 5.58 ms and measured at 0.20 ms.
//
// ── SO WHAT *IS* THE 271 ms? ────────────────────────────────────────────────
// Not work: 217 shared buffers/call, 1 block read from disk in the statement's
// entire lifetime, and a MINIMUM of 0.385 ms. The mean is 1,113 calls carrying
// ~296 s of stall — a handful of multi-second calls on a small sample, not a
// latency a player experiences at the median.
//
// And it is not alone. Exactly three statements on this instance with >100
// calls exceed a 1 s max (query 4 below re-lists them):
//
//     realtime WAL poller (realtime.list_changes)  4,512,285 calls  max 9.8 s
//     spend.js gate+projection                         1,113 calls  max 6.8 s
//     hr_apply                                        14,240 calls  max 2.5 s
//
// The heaviest thing on the box by four orders of magnitude is the Realtime
// replication poller at 1,524 buffers/call × 4.5M calls, and its max EXCEEDS
// the one being attributed to the rate gate. Three unrelated statements sharing
// a multi-second tail is an instance-wide stall signature, not a lock on
// hr_rate_counters.
//
// ── hr_rate_counters IS HEALTHY, MEASURED ───────────────────────────────────
// The hypotheses the audit asked to test, each refuted by query 3:
//   · HOT-update churn      433,001 of 433,121 updates are HOT = 99.97%.
//   · dead-tuple bloat      87 dead vs 1,829 live.
//   · missing fillfactor    not needed at 99.97% HOT; adding one would be a
//                           change with no measured cause.
//   · WAL amplification     the table is UNLOGGED (relpersistence 'u'), by
//                           design, per 2026-08-11-player-state.sql §6c-ii.
//   · per-call bucket roll  the upsert's `window_start` arm only rewrites the
//                           row when the window has actually elapsed; 2,247
//                           inserts against 433,121 updates says the row is
//                           reused, not recreated.
//
// ── THE RULING (backend lane, 2026-09-18) ───────────────────────────────────
// NO MIGRATION. The rate gate is an abuse control; it is not touched to fix a
// number that was never its own. Nothing here weakens a limit, because nothing
// here changes a limit. The genuine residual question — why three statements
// share a multi-second tail, with the Realtime poller at the head of the list —
// is an instance-capacity question and belongs to the reliability lane.
//
// ⚠ ONE REAL STRUCTURAL NOTE FOR THE WORLD TICK, recorded because it is cheap
//   to state and expensive to discover: in shape B the hr_rate_counters row
//   lock taken by the gate is held for the REST of the statement (Postgres
//   releases row locks at commit, and `exec` in index.ts wraps each statement
//   in its own transaction). So a stalled projection also holds that user's
//   counter row, and every other spend-family call from the same user queues
//   behind it. That converts one slow call into a per-user serial queue. It is
//   NOT today's 271 ms — shape A, which does not have this property, and
//   set-activity, which does, are both fast — but it is the shape to avoid if a
//   10 s world tick ever calls a gated verb on behalf of a player. Shape A
//   (gate as its own statement, early-return in JS) already exists and is the
//   one to copy; it costs one extra round trip and holds no lock across a read.
// ============================================================================
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const URL_Q = 'https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query';

/* The four queries, in the order the argument is made. Each is SELECT-only and
   is checked to be, below — a read-only ops tool that could write is a writer
   nobody reviewed. */
const QUERIES = [
  ['1. attribution premise — is nested tracking even on?', `
    select name, setting from pg_settings
     where name in ('pg_stat_statements.track','pg_stat_statements.max','track_io_timing')
     order by name`],

  ['2. the gate alone vs the statements whose TEXT merely starts with it', `
    select case when query ilike 'with g as%' then 'WRAPPED: ' else 'BARE:    ' end ||
           left(regexp_replace(query,'\\s+',' ','g'), 120)              as shape,
           calls,
           round(mean_exec_time::numeric,2)                            as mean_ms,
           round(min_exec_time::numeric,3)                             as min_ms,
           round(max_exec_time::numeric,1)                             as max_ms,
           round(stddev_exec_time::numeric,1)                          as sd_ms,
           round(shared_blks_hit::numeric/greatest(calls,1),0)          as blks_per_call
      from pg_stat_statements
     where query ilike '%hr_rate_gate%' or query ~ '^\\s*select public\\.hr_(state_of|apply)'
     order by mean_exec_time desc`],

  ['3. hr_rate_counters health — churn, bloat, persistence', `
    select s.relname, s.n_live_tup, s.n_dead_tup, s.n_tup_ins, s.n_tup_upd, s.n_tup_hot_upd,
           round(100.0*s.n_tup_hot_upd/greatest(s.n_tup_upd,1), 2) as hot_pct,
           c.relpersistence, c.reloptions, s.last_autovacuum
      from pg_stat_user_tables s join pg_class c on c.oid = s.relid
     where s.relname = 'hr_rate_counters'`],

  ['4. every statement on this instance with a multi-second tail', `
    select left(regexp_replace(query,'\\s+',' ','g'),80) as q, calls,
           round(mean_exec_time::numeric,2) as mean_ms,
           round(max_exec_time::numeric,1)  as max_ms,
           round(shared_blks_hit::numeric/greatest(calls,1),0) as blks_per_call
      from pg_stat_statements
     where calls > 100 and max_exec_time > 1000
     order by max_exec_time desc limit 15`],
];

const WRITE_RE = /\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do)\b/i;

async function run(sql) {
  const token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
  const r = await fetch(URL_Q, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

/* Printed as aligned columns rather than JSON because the whole point is that a
   human COMPARES two rows of it and sees that the slower one does less work. */
function table(rows) {
  if (!rows.length) return '  (no rows)';
  const cols = Object.keys(rows[0]);
  const w = Object.fromEntries(cols.map((c) =>
    [c, Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length))]));
  const line = (vals) => '  ' + cols.map((c) => String(vals[c] ?? '').padEnd(w[c])).join('  ');
  return [line(Object.fromEntries(cols.map((c) => [c, c]))),
          '  ' + cols.map((c) => '-'.repeat(w[c])).join('  '),
          ...rows.map(line)].join('\n');
}

for (const [title, sql] of QUERIES) {
  if (WRITE_RE.test(sql)) {
    console.error(`rate-gate-attribution: refusing — "${title}" is not SELECT-only`);
    process.exitCode = 2;
    throw new Error('not select-only');
  }
}

console.log('rate-gate-attribution — READ-ONLY, production. Read the header before the numbers.\n');
for (const [title, sql] of QUERIES) {
  console.log(`── ${title}`);
  console.log(table(await run(sql)));
  console.log('');
}
console.log('VERDICT TEST: in query 2, the BARE hr_rate_gate row is the gate. If its mean is');
console.log('single-digit-millisecond, the gate is not slow and any large number on a WRAPPED');
console.log('row belongs to what the statement wraps or waits on — not to the rate limiter.');
