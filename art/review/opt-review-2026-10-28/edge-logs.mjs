// art/review/opt-review-2026-10-28/edge-logs.mjs — hr-accrue edge wall time from the unified logs stream.
//
//   node art/review/opt-review-2026-10-28/edge-logs.mjs [hours<=24] [out.json]
//
// GET-only: Management API /analytics/endpoints/logs (ClickHouse dialect; logs.all is 410 Gone since the 2026
// migration), ~/.supabase-token read as bytes. Splits hr-accrue invocations into the pg_net TICK (user agent
// pg_net/*) and PLAYER doors (browsers), with execution_time_ms percentiles, so per-settle edge wall time can be
// compared with the DB time of the same window (server-diff.mjs).
import { writeFileSync } from 'node:fs';
import { api } from './lib-q.mjs';

const hours = Math.min(24, Number(process.argv[2]) || 24);
const out = process.argv[3];
const end = new Date();
const start = new Date(end.getTime() - hours * 3600e3);

async function logs(sql) {
  const qs = new URLSearchParams({ sql, iso_timestamp_start: start.toISOString(), iso_timestamp_end: end.toISOString() });
  const r = await api('/analytics/endpoints/logs?' + qs.toString());
  if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 300));
  return r.result || [];
}
const A = (k) => `log_attributes['${k}']`;
const ET = `toFloat64OrZero(${A('execution_time_ms')})`;
const WHO = `if(startsWith(${A('request.headers.user_agent')}, 'pg_net'), 'tick', 'player')`;

const run = async (name, sql) => { try { return await logs(sql); } catch (e) { return [{ error: name + ': ' + e.message }]; } };
const res = { window: { start, end, hours } };
res.by_door = await run('by_door', `select ${A('request.pathname')} path, ${WHO} door, ${A('request.method')} method, ${A('response.status_code')} status,
    count() n, round(avg(${ET})) avg_ms, quantile(0.5)(${ET}) p50, quantile(0.95)(${ET}) p95, quantile(0.99)(${ET}) p99, max(${ET}) max_ms,
    round(avg(toFloat64OrZero(${A('request.headers.content_length')}))) avg_req_b
  from logs where source = 'function_edge_logs' group by path, door, method, status order by n desc limit 40`);
res.by_hour = await run('by_hour', `select toStartOfHour(timestamp) h, ${WHO} door, count() n, round(avg(${ET})) avg_ms, quantile(0.95)(${ET}) p95
  from logs where source = 'function_edge_logs' and ${A('request.pathname')} = '/functions/v1/hr-accrue' group by h, door order by h, door`);
res.runtime_events = await run('runtime_events', `select substring(event_message, 1, 90) msg, count() n from logs where source = 'function_logs'
  and (positionCaseInsensitive(event_message, 'boot') > 0 or positionCaseInsensitive(event_message, 'shutdown') > 0
    or positionCaseInsensitive(event_message, 'limit') > 0 or positionCaseInsensitive(event_message, 'exceeded') > 0
    or positionCaseInsensitive(event_message, 'memory') > 0 or positionCaseInsensitive(event_message, 'error') > 0)
  group by msg order by n desc limit 25`);
res.pg_slow = await run('pg_slow', `select substring(event_message, 1, 160) msg, count() n from logs where source = 'postgres_logs'
  and (positionCaseInsensitive(event_message, 'duration') > 0 or positionCaseInsensitive(event_message, 'deadlock') > 0
    or positionCaseInsensitive(event_message, 'timeout') > 0 or positionCaseInsensitive(event_message, 'too many') > 0
    or positionCaseInsensitive(event_message, 'canceling') > 0) group by msg order by n desc limit 25`);
res.pg_errors = await run('pg_errors', `select substring(event_message, 1, 140) msg, count() n from logs where source = 'postgres_logs'
  and (positionCaseInsensitive(event_message, 'error') > 0 or positionCaseInsensitive(event_message, 'fatal') > 0)
  group by msg order by n desc limit 20`);

if (out) writeFileSync(out, JSON.stringify(res, null, 1));
for (const k of ['by_door', 'runtime_events', 'pg_slow', 'pg_errors']) { console.log(k + ':'); console.table(res[k]); }
