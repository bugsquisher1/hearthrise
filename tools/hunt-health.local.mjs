// tools/hunt-health.local.mjs — one server's view of every open hunt, read-only, one screen.
//
//   node tools/hunt-health.local.mjs            open hunts, settle lag, rate counters, today's refusals
//   node tools/hunt-health.local.mjs --watch 15 re-read every 15 s (Ctrl+C stops)
//   node tools/hunt-health.local.mjs --all      every open hunt, not just the alarms and the 12 most behind
//   node tools/hunt-health.local.mjs --env staging   the staging project (default: production; tools/lib/env.mjs)
//   Also prints the server's pulse (tools/lib/server-pulse.mjs): disk, connections, the tick, its edge answers, retention, frames.
//
// The first line printed is the project. SELECT-only through the Management API with the env's token file
// (read as bytes, never printed), inside a READ ONLY transaction. Lag verdicts: tools/lib/hunt-lag.mjs (FREEZING = a WATCHED hunt past the
// 32 s look-ahead; STALLED = past the tick's own flush; an unwatched hunt's 0-100 s sawtooth is by design).
// Local tool, not in CI.
import { readFileSync } from 'node:fs';
import { isMain } from '../tests/_is-main.mjs';
import { lagVerdict, WATCHED_SQL, watchedOf } from './lib/hunt-lag.mjs';
import { pulseLines } from './lib/server-pulse.mjs';
import { resolveEnv, runTool, scrub, API } from './lib/env.mjs';

const SHOWN = 12;

const HUNTS = `select left(i.id::text, 8) inst, i.hunt_id, i.kind, count(*) heroes,
  string_agg(left(s.user_id::text, 8) || ':' || s.slot || (case when s.leave_at is not null then ' leaving' else '' end), ' ', ) who,
  round(extract(epoch from now() - i.settled_to)) lag_s, i.world_swing, array_agg(s.user_id::text || ':' || s.slot) seats, round(extract(epoch from now() - min(s.entered_at)) / 60) mins
  from public.hunt_sessions s join public.hunt_instances i on i.id = s.instance_id
  where s.ended_at is null group by i.id order by lag_s desc`.replace(', ' + ')', ')');
const RATE = `select left(user_id::text, 8) u, bucket, sum(n) n from public.hr_rate_counters
  where window_start > now() - interval '2 minutes' group by 1, 2 order by n desc limit 12`;
const TICK = 'select flush_seconds, cadence_seconds from public.hr_tick_config where id';
const REFUSED = `select left(user_id::text, 8) u, code, intent, sum(n) n, max(last_at) last from public.hr_rejections
  where day = current_date group by 1, 2, 3 order by last desc limit 10`;

/* THE SERVER'S PULSE (lane/r-beta-load): disk, connections, the tick's own heartbeat, the edge's answers to it, retention,
   frames. tools/lib/server-pulse.mjs holds the limits; a failing one prints `<<`. */
const PULSE_DB = `select pg_database_size(current_database()) db_bytes,
    (select db_bytes from public.hr_db_samples where at < now() - interval '23 hours' order by at desc limit 1) db_bytes_24h,
    (select count(*) from pg_stat_activity) conns, current_setting('max_connections')::int max_conns,
    (select count(*) from pg_stat_activity where usename = 'hr_engine_login') engine_conns,
    (select rolconnlimit from pg_roles where rolname = 'hr_engine_login') engine_cap,
    (select count(*) from pg_stat_activity where state = 'active' and backend_type = 'client backend') active,
    (select max(used_conns) from public.hr_db_samples where at > now() - interval '24 hours') peak_conns,
    (select count(*) from public.player_ledger where at > now() - interval '24 hours') ledger_rows_24h`;
const PULSE_TICK = `select extract(epoch from now() - max(at)) last_s, count(*) fires from public.hr_tick_cron_log where at > now() - interval '10 minutes'`;
const PULSE_NET = `select count(*) posts, count(*) filter (where status_code >= 500) e5xx, count(*) filter (where timed_out or status_code is null) timed_out
  from net._http_response where created > now() - interval '10 minutes'`;
const PULSE_FRAMES = `select extract(epoch from (now() at time zone 'utc') - min(inserted_at)) / 3600 oldest_h,
    count(*) filter (where inserted_at > (now() at time zone 'utc') - interval '1 minute') frames_1m,
    coalesce(sum(octet_length(payload::text)) filter (where inserted_at > (now() at time zone 'utc') - interval '1 minute'), 0) / 60.0 / 1024 kbs
  from realtime.messages where event = 'frame'`;
const PULSE_CRON = `select count(*) failed from cron.job_run_details where status = 'failed' and start_time > now() - interval '1 hour'`;

/* THE DATABASE'S BUSY TIME, over a few seconds: the first thing the beta's load reaches (tools/beta-load.mjs). pg_stat_statements' execution time is
   CPU here (production's hit ratio is 1.0), in ms a second; 1,000 is one core. The Management API shows no CPU figure. */
const PULSE_BUSY = "select sum(total_exec_time) ms, extract(epoch from clock_timestamp()) at_s from extensions.pg_stat_statements";
const BUSY_WINDOW_MS = 3000;
/* The edge's own answers to everyone (browser and tick), from its logs: 10 minutes, bounded so a slow logs read costs a line, never the screen. */
const PULSE_EDGE_SQL = "select count() as n, countIf(toInt32OrZero(log_attributes['response.status_code']) >= 500) as e5xx from logs where source = 'function_edge_logs' and log_attributes['request.pathname'] = '/functions/v1/hr-accrue'";

/**
 * @param {string[]} argv
 * @param {object} [deps]  { fetch, read, home, log, err, busyWindowMs }: injectable (tests/tool-env.mjs)
 * @returns {Promise<number>} the first read's exit code (a --watch keeps reading after it)
 */
export async function main(argv, deps = {}) {
const log = deps.log || console.log;
const err = deps.err || console.error;
const fetchImpl = deps.fetch || fetch;
const env = resolveEnv({ argv, write: false, home: deps.home, read: deps.read || ((p) => readFileSync(p, 'utf8')) });
const REF = env.ref;
const at = argv.indexOf('--watch');
const watchS = at >= 0 ? Math.max(5, Number(argv[at + 1]) || 15) : 0;
const busyMs = deps.busyWindowMs === undefined ? BUSY_WINDOW_MS : deps.busyWindowMs;

async function q(sql) {
  if (!/^\s*(select|with)\b/i.test(sql) || /\b(insert|update|delete|drop|alter|create|grant|truncate|call)\b/i.test(sql)) throw new Error('read-only queries only');
  const r = await fetchImpl(env.db, {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.token(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
  if (!r.ok) throw new Error('database answered ' + r.status + ' ' + scrub(await r.text(), env).slice(0, 120));
  return r.json();
}

async function edgeAnswers() {
  const end = new Date();
  const qs = new URLSearchParams({ sql: PULSE_EDGE_SQL, iso_timestamp_start: new Date(end.getTime() - 600000).toISOString(), iso_timestamp_end: end.toISOString() });
  const r = await fetchImpl(`${API}/v1/projects/${REF}/analytics/endpoints/logs?${qs}`, { headers: { Authorization: 'Bearer ' + env.token() }, signal: AbortSignal.timeout(4000) });
  const j = await r.json();
  return (j.result || [])[0] || {};
}

async function pulse(hunts, stalled) {
  const [b0] = await q(PULSE_BUSY);
  const [[d], [t], [n], [f], [c], logs] = await Promise.all([q(PULSE_DB), q(PULSE_TICK), q(PULSE_NET), q(PULSE_FRAMES), q(PULSE_CRON), edgeAnswers().catch(() => ({})),
    new Promise((res) => setTimeout(res, busyMs))]);
  const [b1] = await q(PULSE_BUSY);
  const dbMsPerS = (Number(b1.ms) - Number(b0.ms)) / Math.max(0.5, Number(b1.at_s) - Number(b0.at_s));
  /* The filesystem's own numbers: WAL and the slot's reserve live on this disk too (902 MB used for a 288 MB database, 11-02). */
  const util = await fetchImpl(`${API}/v1/projects/${REF}/config/disk/util`, { headers: { Authorization: 'Bearer ' + env.token() } }).then((r) => r.json()).catch(() => null);
  const fs = (util && util.metrics) || {};
  return pulseLines({ dbBytes: d.db_bytes, dbBytes24h: d.db_bytes_24h, fsUsedBytes: fs.fs_used_bytes, diskBytes: fs.fs_size_bytes, conns: d.conns, maxConns: d.max_conns, engineConns: d.engine_conns, engineCap: d.engine_cap,
    active: d.active, peakConns: d.peak_conns, ledgerRows24h: d.ledger_rows_24h, tickLastS: t.last_s, fires10m: t.fires, edgePosts10m: n.posts, edge5xx10m: n.e5xx, edgeTimedOut10m: n.timed_out,
    openHunts: hunts.length, stalledHunts: stalled, worstLagS: Math.max(0, ...hunts.map((h) => Number(h.lag_s) || 0)), oldestFrameH: f.oldest_h, frames1m: f.frames_1m, frameKBs: f.kbs, cronFailed1h: c.failed, dbMsPerS, edgeAll10m: logs.n, edgeAll5xx10m: logs.e5xx });
}

async function once() {
  const [hunts, rate, refused, watchedRows, tick] = await Promise.all([q(HUNTS), q(RATE), q(REFUSED), q(WATCHED_SQL), q(TICK)]);
  const watched = watchedOf(watchedRows);
  const cfg = { flushS: Number((tick[0] || {}).flush_seconds) || 90, cadenceS: Number((tick[0] || {}).cadence_seconds) || 10 };
  log(`${env.banner}\nHunt health at ${new Date().toLocaleTimeString()}`);
  if (!hunts.length) log('  no open hunts');
  /* One screen at a beta's 50+ open hunts: every alarm, then the most behind up to SHOWN (--all: every one). */
  const lines = hunts.map((h) => {
    const seats = (Array.isArray(h.seats) ? h.seats : String(h.seats || '').replace(/[{}]/g, '').split(',')).map((x) => [x.slice(0, x.lastIndexOf(':')), x.slice(x.lastIndexOf(':') + 1)]);
    const v = lagVerdict({ lagS: Number(h.lag_s), watched: watched(seats), ...cfg });
    const flag = v.code === 'ok' ? `  (${v.note})` : `  << ${v.note}`;
    return { code: v.code, text: `  ${h.inst} ${h.hunt_id} ${h.kind} ×${h.heroes} [${h.who}] lag ${h.lag_s}s, swing ${h.world_swing}, ${h.mins} min${flag}` };
  });
  const alarms = lines.filter((l) => l.code !== 'ok');
  const rest = lines.filter((l) => l.code === 'ok');
  const shown = argv.includes('--all') ? lines : [...alarms, ...rest.slice(0, Math.max(0, SHOWN - alarms.length))];
  for (const l of shown) log(l.text);
  if (shown.length < lines.length) log(`  ... and ${lines.length - shown.length} more, all ok (--all lists them)`);
  try { for (const l of await pulse(hunts, lines.filter((x) => x.code === 'STALLED').length)) log(l); } catch (e) { log('Server pulse unreadable << ' + e.message); }
  log('Rate counters, last 2 min: ' + (rate.length ? rate.map((r) => `${r.u} ${r.bucket}=${r.n}`).join(' · ') : 'none'));
  log('Refusals today: ' + (refused.length ? '' : 'none'));
  for (const r of refused) log(`  ${r.u} ${r.code} (${r.intent}) ×${r.n}, last ${String(r.last).slice(11, 19)}`);
}

let code = 0;
await once().catch((e) => { err(env.banner + '\nhunt-health: ' + e.message); code = 1; });
/* a run under a test's fake fetch reads once */
if (watchS && !deps.fetch) setInterval(() => once().catch((e) => err('hunt-health: ' + e.message)), watchS * 1000);
return code;
}

if (isMain(import.meta.url)) process.exitCode = await runTool(main, process.argv.slice(2));
