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
import { analyzeRows, verdict, gatherDryRun, MISSING_FOR_VALUE_REPLAY, JOURNALLED_WINDOW_TERMS }
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
/* THE JOURNALLING CHANGE, MEASURED RATHER THAN ASSUMED. `meta.w` landed on
   2026-09-18; every row written before it is `waste: null` and keeps the old
   inference. This line is how we see the field actually reach production. */
console.log(`pairs whose window carried meta.w (${JOURNALLED_WINDOW_TERMS.join(' + ')}): `
  + `${a.withWaste}, of which ${a.provenWithWaste} proven`);
if (a.withWaste === 0) {
  console.log('   (none yet — either the read predates the field or the edge has not been deployed)');
}

if (a.unaccounted.length) {
  console.log(`\n${a.unaccounted.length} "unaccounted" pairs — the window's ms minus its deferral is NOT a`);
  console.log('whole number of its own ticks, which means the simulation spent time on something');
  console.log(`the journal does not record: ${JOURNALLED_WINDOW_TERMS.join(', ')}. Rows written since`);
  console.log('2026-09-18 carry both as meta.w and are judged rather than bucketed; these are older.');
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

/* ── THE GATHER DRY RUN ─────────────────────────────────────────────────────
   `--gather` prints what the world tick WOULD have written for the same real
   gather windows, next to what accrual actually wrote. Still READ-ONLY and
   still SELECT-only: it consumes the rows already fetched above and issues no
   further query. Value is deliberately NOT re-rolled — see gatherDryRun's
   header for why a re-roll printed next to a historical result is worse than
   no comparison at all. */
if (ARGS.includes('--gather')) {
  const FLUSH = Math.max(1000, Number(arg('flush', 90000)) || 90000);
  const g = gatherDryRun(rows, { flushMs: FLUSH });
  console.log(`\n── GATHER DRY RUN (no writes, no rolls) — ${g.windows} real gather windows, ${FLUSH / 1000}s flush ──`);
  if (g.windows === 0) {
    console.log('   no gather accrue windows in the fetched range.');
  } else {
    const head = ['stream'.padEnd(14), 'accrue rows'.padStart(12), 'tick rows'.padStart(11),
      'span (h)'.padStart(10), 'ticks'.padStart(9), 'qty'.padStart(8),
      'deferred'.padStart(10), 'overlap'.padStart(9), 'gap'.padStart(6), 'unprov'.padStart(8)];
    console.log(head.join(''));
    for (const s of g.streams) {
      console.log([s.stream.padEnd(14), String(s.accrueRows).padStart(12), String(s.tickRows).padStart(11),
        (s.spanMs / 3600000).toFixed(2).padStart(10), String(s.ticks).padStart(9), String(s.qty).padStart(8),
        String(s.deferred).padStart(10), String(s.overlap).padStart(9), String(s.gap).padStart(6),
        String(s.unprovable).padStart(8)].join(''));
    }
    const t = g.total;
    console.log(['TOTAL'.padEnd(14), String(t.accrueRows).padStart(12), String(t.tickRows).padStart(11),
      (t.spanMs / 3600000).toFixed(2).padStart(10), String(t.ticks).padStart(9), String(t.qty).padStart(8),
      String(t.deferred).padStart(10), String(t.overlap).padStart(9), String(t.gap).padStart(6),
      String(t.unprovable).padStart(8)].join(''));
    const mult = t.accrueRows ? (t.tickRows / t.accrueRows) : 0;
    console.log(`\nROW COST: the tick would have written ${t.tickRows} ledger rows where accrual wrote`);
    console.log(`${t.accrueRows} — ×${mult.toFixed(2)}, i.e. ~${Math.round(t.tickRows * 407 / 1024)} KiB against ~${Math.round(t.accrueRows * 407 / 1024)} KiB at the measured 407 B/row.`);
    console.log(`Per-tick journalling over the same span would have been ${Math.round(t.spanMs / 10000)} rows (×${(t.spanMs / 10000 / Math.max(1, t.accrueRows)).toFixed(0)}), which is the unit §15a rejected.`);
    console.log(`TILING: ${t.deferred} deferred, ${t.overlap} overlapping, ${t.gap} gapped, `
      + `${t.unprovable} unprovable boundaries inside a stream.`);
    console.log('   DEFERRED is the CORRECT shape and is the great majority: since settledWatermarkMs');
    console.log('   landed (2026-09-16) the next window starts at prev.to MINUS the deferred sub-action');
    console.log('   remainder, so its `from` is legitimately earlier than the previous window\'s `to`.');
    console.log('   Before 2026-09-21 this column did not exist and every one of those boundaries was');
    console.log('   counted as an OVERLAP — that is where the 15 "overlapping" windows of the step-1');
    console.log('   run came from (SEC_WORLD_TICK_GATHER_2026-09-19.md S-5). The classification is now');
    console.log('   replayStream\'s, which solves each window\'s own geometry rather than comparing');
    console.log('   two timestamps.');
    console.log('   A gap is not a fault either — another writer, a set_activity collect or a channel');
    console.log('   switch legitimately settles in between.');
    console.log(`   ⚠ OVERLAP IS THE ONLY FAILING BUCKET: ${t.overlap} window(s) began BEFORE the`);
    console.log('   watermark the previous one earned, which is time paid for twice. Anything above');
    console.log('   zero here is a P1 and is a finding, not a metric.');
    console.log('   UNPROVABLE is the journal declining to answer (a pre-2026-09-18 row with no');
    console.log('   `meta.w`, a zero-tick window, a capped flush) — reported, never counted as a pass.');
    console.log('\nVALUE IS NOT COMPARED HERE and no roll was made. The starting state and the seed');
    console.log('are both absent from the journal (the seed BY DESIGN), so the value proof is made');
    console.log('on fixtures where it is exact: tests/world-tick-parity.mjs P-G1.');
  }
}

process.exitCode = v.failed === 0 ? 0 : 1;
