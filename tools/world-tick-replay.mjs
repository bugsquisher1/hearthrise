// ============================================================================
// tools/world-tick-replay.mjs — replay REAL settle windows against the tick's
// watermark contract. READ-ONLY, SELECT-ONLY, no writes of any kind.
//
//   node tools/world-tick-replay.mjs                 last 14 days, all channels
//   node tools/world-tick-replay.mjs --days=7
//   node tools/world-tick-replay.mjs --save=<file>   write the fetched rows to a
//                                                    file so the analysis can be
//                                                    re-run offline
//   node tools/world-tick-replay.mjs --from=<file>   analyse a saved file, NO
//                                                    network at all
//
// Same access pattern as tools/vitals.mjs: the Supabase access token is read as
// FILE BYTES from ~/.supabase-token, never printed and never placed in argv, and
// the one fixed query is checked to be SELECT-only before it is sent. This tool
// is an ops READ; it is not a migration and it is not a writer.
//
// WHAT IT PROVES, precisely: that the boundary between two consecutive real
// settle windows is the instant `settledWatermarkMs` computes from the FIRST
// window's own journalled numbers. The world tick will settle at 10 s and is
// about to become the highest-frequency producer of those boundaries, so this
// is the property the tick must agree with — checked on production windows
// instead of on a fixture. The analysis itself lives in
// services/world-tick/replay.js and is pure; see its header for the (honest)
// list of what the journal cannot replay.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { analyzeRows, verdict, MISSING_FOR_VALUE_REPLAY, CHEAP_ADDITIONS }
  from '../services/world-tick/replay.js';

const ARGS = process.argv.slice(2);
const arg = (n, d) => { const a = ARGS.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const DAYS = Math.max(1, Math.min(60, Number(arg('days', 14)) || 14));
const SAVE = arg('save', null);
const FROM = arg('from', null);

/* One statement. `meta` carries no free text a player authored — it is the
   engine's own aggregate — but the user_id is hashed on save so a shared
   fixture carries no account identifier. */
const QUERY = `
select user_id, slot, kind, at, meta
  from public.player_ledger
 where intent = 'accrue'
   and at >= now() - interval '${DAYS} days'
   and meta ? 'from' and meta ? 'to'
 order by user_id, slot, kind, at`;

let rows;
if (FROM) {
  rows = JSON.parse(readFileSync(FROM, 'utf8'));
  console.log(`world-tick-replay: OFFLINE, ${rows.length} rows from ${FROM}\n`);
} else {
  if (/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate|call|do)\b/i.test(QUERY)) {
    console.error('world-tick-replay: refusing — query is not SELECT-only');
    process.exitCode = 2; throw new Error('not select-only');
  }
  const token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim();
  const r = await fetch('https://api.supabase.com/v1/projects/nezapsylztqbbwuwembx/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY }),
  });
  const text = await r.text();
  if (!r.ok) { console.error(`world-tick-replay: HTTP ${r.status}: ${text.slice(0, 400)}`); process.exitCode = 1; throw new Error('query failed'); }
  rows = JSON.parse(text);
  console.log(`world-tick-replay: ${rows.length} real settle windows, last ${DAYS} days\n`);
  if (SAVE) {
    const ids = new Map();
    const anon = rows.map((x) => {
      if (!ids.has(x.user_id)) ids.set(x.user_id, `u${ids.size + 1}`);
      return { ...x, user_id: ids.get(x.user_id) };
    });
    writeFileSync(SAVE, JSON.stringify(anon, null, 1));
    console.log(`   saved ${anon.length} rows (user ids replaced by u1..u${ids.size}) to ${SAVE}\n`);
  }
}

const a = analyzeRows(rows);
const v = verdict(a);

const kinds = Object.keys(a.byKind).sort();
const cols = ['watermark_exact', 'flush', 'gap', 'unaccounted', 'no_ticks', 'watermark_mismatch'];
console.log(['channel'.padEnd(9), ...cols.map((c) => c.padStart(19))].join(''));
for (const k of kinds) {
  console.log([k.padEnd(9), ...cols.map((c) => String(a.byKind[k][c] || 0).padStart(19))].join(''));
}
console.log(['TOTAL'.padEnd(9), ...cols.map((c) => String(a.byBucket[c] || 0).padStart(19))].join(''));

console.log(`\nstreams ${a.streams}, consecutive window pairs ${a.pairs}`);
console.log(`PROVEN  ${v.proven} boundaries land exactly on settledWatermarkMs`);
console.log(`FAILED  ${v.failed} boundaries disagree with it`);
console.log(`unprovable from the journal alone: ${v.unprovable} (see the buckets above)`);
console.log(`action intervals inferred: ${a.tickMsSeen.join(', ')} ms`);

if (a.unaccounted.length) {
  console.log(`\n${a.unaccounted.length} "unaccounted" pairs — the window's ms minus its deferral is NOT a`);
  console.log('whole number of its own ticks, which means the simulation spent time on something');
  console.log(`the journal does not record. The missing terms are exactly: ${CHEAP_ADDITIONS.join(', ')}.`);
  for (const u of a.unaccounted.slice(0, 5)) {
    console.log(`   · ${new Date(u.at).toISOString()} ${u.kind}: ms=${u.spanMs} ticks=${u.ticks} deferral=${u.deferral} accounted=${u.accounted} (accounted/ticks=${(u.accounted / u.ticks).toFixed(3)})`);
  }
}

for (const m of a.mismatches.slice(0, 10)) {
  console.log(`   ✗ ${new Date(m.at).toISOString()} ${m.kind}: expected watermark ${m.expected}, journal says ${m.actual}`);
}

console.log('\nA VALUE replay (re-roll the window, compare gold/items/xp) is NOT possible from');
console.log('the journal and this tool does not attempt one. Missing fields, exactly:');
console.log(`   ${MISSING_FOR_VALUE_REPLAY.join(', ')}`);
console.log('The seed is unobtainable BY DESIGN (hr_seed mixes a 256-bit secret behind RLS).');

process.exitCode = v.failed === 0 ? 0 : 1;
