// ============================================================================
// tests/world-tick-stall-guard.mjs — A STALLED TICK IS RED, FROM THE DATABASE ALONE
//
//   node tests/world-tick-stall-guard.mjs              the guard
//   node tests/world-tick-stall-guard.mjs --selftest   four mutants, each required to go RED
//
// THE INVARIANT: "rostered >= 1 and shadow rows/h < 30 for 2 h => red".
//
// Production, 2026-09-26/27: 21.9 h and 14.7 h of ZERO hr_tick_shadow rows
// while pg_cron fired every 10 s, `posted`, rostered = 2, HTTP 200 — and every
// cron-grain read stayed green, because the edge's own verdict
// (`refused: 1, reasons: {window_already_settled: 1}`) lived only in pg_net's
// ~6 h response table. 2026-09-28-world-tick-stall-observability.sql folds that
// verdict into `hr_tick_cron_log.detail.edge` and states the invariant as
// `hr_tick_stall_status()`. This guard proves both on the PGlite chain replay:
//
//   P-IDEM  the file that defines the four bodies AT CHAIN END re-applies
//           byte-identically (its self-check passes a second time; the schema
//           inventory and the four bodies are unchanged). Since 2026-09-28 that
//           is 2026-09-28-tick-harvest-off-rpc-surface.sql for the note, the
//           summary and the harvest (the latter two now in the non-exposed
//           schema hr_ops, T-5 Q-1) and, since 2026-10-06, 2026-10-06-world-tick-channel-arm.sql for the stall
//           status. Re-applying the SUPERSEDED observability file would put the
//           public bridge back and test that instead of the chain end.
//   G1      a planted HEALTHY two hours reads ok
//   G2      a planted STALL — rostered fires every 10 s, zero shadow rows —
//           reads stalled, and names the edge's reason in the bucket
//   G3      one healthy hour out of two is NOT a stall (the 2 h threshold)
//   G4      no roster (nothing to tick) is not a stall
//   G5      a `posted` note folds the tick's own pg_net responses into
//           detail.edge — counts summed, `below_flush` never the top reason,
//           another pg_net caller's body ignored, a 401 counted as non-tick,
//           and a second note does not count the same response twice
//
// Histories are planted at instants no real row occupies (years 2001–2004), so
// the arms are independent of each other and of the replay's own rows. PGlite
// has no pg_net, so G5 creates `net._http_response` with pg_net's column list.
//
// --selftest re-creates ONE function at a time from the migration's own text
// with one load-bearing line broken, and requires the named arm to go red.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const SELFTEST = process.argv.includes('--selftest');
const MIG = '2026-09-28-tick-harvest-off-rpc-surface.sql';
// The stall status was restated by 2026-10-06-world-tick-channel-arm.sql (judged
// while nothing is armed, per-channel config), which is its chain-end file now.
const OBS = '2026-10-06-world-tick-channel-arm.sql';
const read = async (f) => (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
const MIG_SQL = await read(MIG);
const OBS_SQL = await read(OBS);
const U = '00000000-0000-4000-8000-00000000f929';

let db;
try {
  ({ db } = await bootReplay({}));
} catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`);
  process.exit(2);
}
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

/** Where each body lives at chain end, and the file that defines it last. */
const FNS = {
  hr_tick_edge_summary: ['hr_ops', MIG_SQL, MIG],
  hr_tick_edge_harvest: ['hr_ops', MIG_SQL, MIG],
  hr_tick_cron_note: ['public', MIG_SQL, MIG],
  hr_tick_stall_status: ['public', OBS_SQL, OBS],
};
/** One `create or replace function <schema>.<name>(` statement, verbatim from its chain-end file. */
function fnSource(name) {
  const [schema, sql, file] = FNS[name];
  const start = sql.indexOf(`create or replace function ${schema}.${name}(`);
  const end = sql.indexOf('end $$;', start);
  if (start < 0 || end < 0) throw new Error(`${file} no longer defines ${schema}.${name}`);
  return sql.slice(start, end + 'end $$;'.length);
}
const bodies = async () => (await db.query(
  `select n.nspname || '.' || p.proname as f, md5(pg_get_functiondef(p.oid)) as h from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'hr_ops') and p.proname = any($1::text[]) order by 1`, [Object.keys(FNS)])).rows
  .map((r) => `${r.f}:${r.h}`).join(',');

// ── THE PLANTED HISTORIES ───────────────────────────────────────────────────
await db.exec(`insert into auth.users (id) values ('${U}') on conflict do nothing;`);
await db.exec('update public.hr_tick_config set enabled = true, armed_channels = array[]::text[] where id;');

/** Two hours of fires ending at `at`, one per 10 s, each rostering `rostered`. */
async function plantFires(at, rostered, reason) {
  await db.query(
    `insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds, detail)
     select $1::timestamptz - make_interval(secs => g * 10), 'posted', 5, $2, 10,
            case when $3::text is null then null
                 else jsonb_build_object('edge', jsonb_build_object('refused', 1, 'shadowed', 0,
                                                                    'top_reason', $3::text)) end
       from generate_series(1, 719) g`, [at, rostered, reason]);
}
/** `n` shadow rows spread over the hour ending at `hiAt`. */
async function plantRows(hiAt, n) {
  await db.query(
    `insert into public.hr_tick_shadow (at, user_id, slot, channel, holder, window_from, window_to,
                                        version, intent_id, delta)
     select $1::timestamptz - make_interval(secs => g * 90), $2::uuid, 0, 'gather', 'guard',
            $1::timestamptz - make_interval(secs => g * 90 + 90), $1::timestamptz - make_interval(secs => g * 90),
            1, gen_random_uuid(), '{}'::jsonb
       from generate_series(1, $3::int) g`, [hiAt, U, n]);
}
const status = async (at) => (await one(
  'select public.hr_tick_stall_status($1::timestamptz, 2, 30) as s', [at])).s;

const T1 = '2001-01-01 12:00:00+00';   // healthy
const T2 = '2002-01-01 12:00:00+00';   // stalled
const T3 = '2003-01-01 12:00:00+00';   // half
const T4 = '2004-01-01 12:00:00+00';   // no roster
await plantFires(T1, 2, null);
await plantRows(T1, 40);
await plantRows('2001-01-01 11:00:00+00', 40);
await plantFires(T2, 2, 'window_already_settled');
await plantFires(T3, 2, null);
await plantRows('2003-01-01 11:00:00+00', 40);   // the OLDER hour healthy, the recent one quiet
await plantFires(T4, 0, null);

// pg_net's response table, as pg_net declares it, where the replay has none.
await db.exec(`do $$ begin
  if to_regclass('net._http_response') is null then
    create schema if not exists net;
    create table net._http_response (id bigint primary key, status_code int, content_type text,
      headers jsonb, content text, timed_out boolean, error_msg text,
      created timestamptz not null default now());
  end if; end $$;`);

// ── THE ARMS ────────────────────────────────────────────────────────────────
async function arms() {
  const red = [];
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) console.log(`  ✓ ${id} — ${okMsg}`);
    else { red.push(id); console.log(`  ✗ ${id} — ${badMsg}`); }
  };

  const s1 = await status(T1);
  ok('G1', s1.ok === true && s1.stalled === false && s1.judged === true,
    'two healthy hours (40 rows each, rostered every fire) read ok',
    `a healthy history read ${JSON.stringify({ ok: s1.ok, stalled: s1.stalled, buckets: s1.buckets })}`);

  const s2 = await status(T2);
  ok('G2', s2.stalled === true && s2.ok === false
      && s2.buckets?.[0]?.edge?.top_reason === 'window_already_settled',
    'a planted stall (720 rostered fires, 0 shadow rows) reads STALLED and names the edge\'s '
    + `reason: ${s2.buckets?.[0]?.edge?.top_reason}`,
    `THE STALL WAS NOT DETECTED: ${JSON.stringify({ stalled: s2.stalled, buckets: s2.buckets })}`);

  const s3 = await status(T3);
  ok('G3', s3.stalled === false,
    'a quiet last hour after a healthy one is not a stall — the invariant is TWO hours',
    `a single quiet hour read stalled: ${JSON.stringify(s3.buckets)}`);

  const s4 = await status(T4);
  ok('G4', s4.stalled === false,
    'fires with nothing rostered are not a stall — there was nobody to tick',
    `an empty roster read stalled: ${JSON.stringify(s4.buckets)}`);

  // G5 — the harvest, through the real note.
  await db.exec('delete from net._http_response;');
  await db.exec("delete from public.hr_tick_cron_log where at > now() - interval '1 day';");
  const tick = (refused, reasons) => JSON.stringify({ ok: true, op: 'tick', processed: 0,
    skipped: reasons.below_flush || 0, shadowed: 0, refused, ms: 30, reasons });
  await db.query(`insert into net._http_response (id, status_code, content) values
      (101, 200, $1), (102, 200, $2), (103, 200, $3), (104, 200, '{"op":"push","refused":7}'),
      (105, 401, '{"msg":"Invalid JWT"}')`,
  [tick(1, { below_flush: 1, window_already_settled: 1 }),
    tick(1, { below_flush: 1, window_already_settled: 1 }),
    tick(0, { below_flush: 2 })]);
  await db.exec("select public.hr_tick_cron_note('posted', 5, 2, 10, '{\"auth\":\"v1\"}'::jsonb);");
  const e1 = (await one(`select detail from public.hr_tick_cron_log
                          where at > now() - interval '1 day' order by id desc limit 1`)).detail;
  await db.exec("select public.hr_tick_cron_note('posted', 5, 2, 10, '{\"auth\":\"v1\"}'::jsonb);");
  const e2 = (await one(`select detail from public.hr_tick_cron_log
                          where at > now() - interval '1 day' order by id desc limit 1`)).detail;
  const edge = e1?.edge || {};
  ok('G5', edge.refused === 2 && edge.top_reason === 'window_already_settled' && edge.top_n === 2
      && edge.below_flush === 4 && edge.responses === 4 && edge.non_tick === 1
      && String(edge.last_id) === '105' && e1.auth === 'v1' && !('edge' in (e2 || {})),
    'a posted fire\'s detail carries the edge\'s own verdict: refused 2, top reason '
    + `${edge.top_reason} x${edge.top_n}, below_flush ${edge.below_flush} (never the top), the push `
    + 'body ignored, the 401 counted as non-tick, and the next note counts nothing twice',
    `detail.edge = ${JSON.stringify(edge)}; next note ${JSON.stringify(e2)}`);
  return red;
}

// ── P-IDEM ──────────────────────────────────────────────────────────────────
console.log('\nworld-tick-stall-guard: the stall is a query, and the fire log carries the edge\'s verdict');
let idemRed = false;
{
  const inv0 = JSON.stringify(await inventory(db));
  const b0 = await bodies();
  let err = null;
  try { await db.exec(MIG_SQL); } catch (e) { err = String(e.message).split('\n')[0]; }
  const same = !err && JSON.stringify(await inventory(db)) === inv0 && (await bodies()) === b0;
  if (same) {
    console.log('  ✓ P-IDEM — the file re-applied cleanly: §6 passed a second time, inventory and '
      + 'the four bodies byte-identical');
  } else {
    idemRed = true;
    console.log(`  ✗ P-IDEM — ${err ? `the re-apply FAILED: ${err}` : 'the re-apply changed the schema'}`);
  }
}

if (!SELFTEST) {
  const red = await arms();
  if (idemRed || red.length) {
    console.log(`\nworld-tick-stall-guard: RED — ${[...(idemRed ? ['P-IDEM'] : []), ...red].join(', ')}`);
    process.exit(1);
  }
  console.log('\nworld-tick-stall-guard: green — a stalled tick is red from the database alone.');
  process.exit(0);
}

// ── --selftest: every mutant must turn its arm red ─────────────────────────
const MUTANTS = [
  { name: 'thresholdIgnored', fn: 'hr_tick_stall_status', arm: 'G2',
    find: "or (e->>'shadow_rows')::int >= v_min);", repl: "or (e->>'shadow_rows')::int >= 0);" },
  { name: 'oneHourIsEnough', fn: 'hr_tick_stall_status', arm: 'G3',
    find: 'from generate_series(0, v_hours - 1) g', repl: 'from generate_series(0, 0) g' },
  { name: 'noteDropsEdge', fn: 'hr_tick_cron_note', arm: 'G5',
    find: "v_detail := coalesce(v_detail, '{}'::jsonb) || jsonb_build_object('edge', v_edge);",
    repl: 'v_detail := v_detail;' },
  { name: 'flushWins', fn: 'hr_tick_edge_summary', arm: 'G5',
    find: "where r.key <> 'below_flush' and r.value", repl: 'where r.value' },
];
let missed = 0;
for (const m of MUTANTS) {
  const src = fnSource(m.fn);
  if (!src.includes(m.find)) {
    console.error(`--selftest: mutant ${m.name} cannot be planted — its anchor is gone from ${m.fn}`);
    process.exit(2);
  }
  console.log(`\n  -- mutant ${m.name} (${m.fn}), must turn ${m.arm} red`);
  await db.exec(src.replace(m.find, m.repl));
  const red = await arms();
  await db.exec(src);                     // restore the file's own body
  if (red.includes(m.arm)) console.log(`  CAUGHT ${m.name} by ${m.arm}`);
  else { missed += 1; console.log(`  MISSED ${m.name}: ${m.arm} stayed green`); }
}
if (missed || idemRed) {
  console.log(`\nworld-tick-stall-guard --selftest: RED — ${missed} mutant(s) survived${idemRed ? ', P-IDEM red' : ''}`);
  process.exit(1);
}
console.log(`\nworld-tick-stall-guard --selftest: green — all ${MUTANTS.length} mutants caught.`);
